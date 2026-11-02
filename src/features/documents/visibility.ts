import { and, desc, eq, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents, documentText, documentVersions, type FileRow, files } from '@/db/schema'
import {
  isBoardMember,
  memberCanSeeApplication,
  memberCanSeeMeeting,
} from '@/features/access/predicates'
import { hasFullRecordAccess, isReviewer } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'
import { err, ok, type Result } from '@/types/result'

const NOTHING = sql`false`

function partyClause(userId: string): SQL {
  return sql`('project_parties' = any(${documents.audiences}) and (
    (${documents.recordKind} = 'project' and exists (
      select 1 from project_parties pp
      where pp.project_id = ${documents.recordId} and pp.user_id = ${userId} and pp.removed_at is null))
    or (${documents.recordKind} = 'application' and exists (
      select 1 from applications a join project_parties pp on pp.project_id = a.project_id
      where a.id = ${documents.recordId} and pp.user_id = ${userId} and pp.removed_at is null))
    or (${documents.recordKind} = 'inspection' and exists (
      select 1 from inspections i
      join applications a on a.id = i.application_id
      join project_parties pp on pp.project_id = a.project_id
      where i.id = ${documents.recordId} and pp.user_id = ${userId} and pp.removed_at is null))
  ))`
}

function reviewerClause(userId: string): SQL {
  return sql`('reviewers' = any(${documents.audiences}) and (
    (${documents.recordKind} = 'application' and exists (
      select 1 from review_assignments ra
      where ra.application_id = ${documents.recordId} and ra.reviewer_user_id = ${userId} and ra.removed_at is null))
    or (${documents.recordKind} = 'project' and exists (
      select 1 from review_assignments ra join applications a on a.id = ra.application_id
      where a.project_id = ${documents.recordId} and ra.reviewer_user_id = ${userId} and ra.removed_at is null))
  ))`
}

function boardMemberClause(userId: string): SQL {
  return sql`('board' = any(${documents.audiences}) and (
    (${documents.recordKind} = 'application' and ${memberCanSeeApplication(userId, sql`${documents.recordId}`)})
    or (${documents.recordKind} = 'meeting' and ${memberCanSeeMeeting(userId, sql`${documents.recordId}`)})
  ))`
}

export function documentPrivateAccess(actor: Actor | null): SQL {
  if (actor === null) return NOTHING
  if (hasFullRecordAccess(actor)) return sql`true`
  const clauses = [partyClause(actor.userId)]
  if (isReviewer(actor)) clauses.push(reviewerClause(actor.userId))
  if (isBoardMember(actor)) clauses.push(boardMemberClause(actor.userId))
  return sql`(${sql.join(clauses, sql` or `)})`
}

export function documentVisibleTo(actor: Actor | null): SQL {
  return sql`(${documents.isPublic} or ${documentPrivateAccess(actor)})`
}

export type Rendition = 'default' | 'pdfa'

export interface ResolvedRendition {
  versionId: string
  role: 'original' | 'public_redacted' | 'pdfa'
  file: FileRow
  filename: string
  contentType: string
}

export async function resolveRendition(
  db: DbOrTx,
  actor: Actor | null,
  documentId: string,
  signal: AbortSignal,
  rendition: Rendition = 'default',
): Promise<Result<ResolvedRendition, 'not_found'>> {
  signal.throwIfAborted()
  const [doc] = await db
    .select({ id: documents.id, privately: sql<boolean>`${documentPrivateAccess(actor)}` })
    .from(documents)
    .where(and(eq(documents.id, documentId), documentVisibleTo(actor)))
  if (doc === undefined) return err('not_found')
  const versions = await db
    .select({
      id: documentVersions.id,
      role: documentVersions.role,
      filename: documentVersions.filename,
      contentType: documentVersions.contentType,
      file: files,
    })
    .from(documentVersions)
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.createdAt))
  const latest = (role: ResolvedRendition['role']) => versions.find((v) => v.role === role)
  const textLayers = await textLayerByVersion(db, documentId)
  const chosen = chooseVersion(doc.privately, rendition, latest, textLayers)
  if (chosen === undefined) return err('not_found')
  return ok({
    versionId: chosen.id,
    role: chosen.role,
    file: chosen.file,
    filename: chosen.filename,
    contentType: chosen.contentType,
  })
}

async function textLayerByVersion(
  db: DbOrTx,
  documentId: string,
): Promise<ReadonlyMap<string, boolean>> {
  const rows = await db
    .select({ versionId: documentText.versionId, hasTextLayer: documentText.hasTextLayer })
    .from(documentText)
    .innerJoin(documentVersions, eq(documentVersions.id, documentText.versionId))
    .where(eq(documentVersions.documentId, documentId))
  return new Map(rows.map((r) => [r.versionId, r.hasTextLayer]))
}

interface Candidate {
  id: string
  contentType: string
}

function defaultOriginal<T extends Candidate>(
  latest: (role: ResolvedRendition['role']) => T | undefined,
  textLayers: ReadonlyMap<string, boolean>,
): T | undefined {
  const original = latest('original')
  const pdfa = latest('pdfa')
  if (original === undefined || pdfa === undefined || textLayers.get(pdfa.id) !== true) {
    return original
  }
  const scanned = original.contentType === 'image/tiff' || textLayers.get(original.id) !== true
  return scanned ? pdfa : original
}

function chooseVersion<T extends Candidate>(
  privately: boolean,
  rendition: Rendition,
  latest: (role: ResolvedRendition['role']) => T | undefined,
  textLayers: ReadonlyMap<string, boolean>,
): T | undefined {
  if (rendition === 'pdfa') return privately ? latest('pdfa') : undefined
  const preferred = defaultOriginal(latest, textLayers)
  if (privately) return preferred
  return latest('public_redacted') ?? preferred
}
