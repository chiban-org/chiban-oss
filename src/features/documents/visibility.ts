import { and, desc, eq, isNull, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  documents,
  documentText,
  documentVersions,
  type FileRow,
  files,
  renditionApprovals,
} from '@/db/schema'
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

function publicDocument(): SQL {
  return sql`(${documents.isPublic} and ${documents.recordKind} <> 'rtk_request' and exists (
    select 1 from rendition_approvals ra
    where ra.document_id = ${documents.id} and ra.purpose = 'public' and ra.revoked_at is null)
    and (${documents.recordKind} <> 'enforcement_case' or exists (
    select 1 from enforcement_cases ec
    where ec.id = ${documents.recordId} and ec.is_public)))`
}

export function documentVisibleTo(actor: Actor | null): SQL {
  return sql`(${documents.disposedAt} is null and (${publicDocument()} or ${documentPrivateAccess(actor)}))`
}

export type Rendition = 'default' | 'pdfa'

export interface ResolvedRendition {
  versionId: string
  role: 'original' | 'public_redacted' | 'pdfa' | 'release_redacted'
  file: FileRow
  filename: string
  contentType: string
  viaPublicApproval: boolean
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
  const chosen = doc.privately
    ? chooseVersion(rendition, latest, textLayers)
    : await approvedPublicVersion(db, documentId, rendition, versions, latest, textLayers)
  if (chosen === undefined) return err('not_found')
  return ok({
    versionId: chosen.id,
    role: chosen.role,
    file: chosen.file,
    filename: chosen.filename,
    contentType: chosen.contentType,
    viaPublicApproval: !doc.privately,
  })
}

async function approvedPublicVersion<T extends Candidate & { role: ResolvedRendition['role'] }>(
  db: DbOrTx,
  documentId: string,
  rendition: Rendition,
  versions: T[],
  latest: (role: ResolvedRendition['role']) => T | undefined,
  textLayers: ReadonlyMap<string, boolean>,
): Promise<T | undefined> {
  if (rendition === 'pdfa') return undefined
  const [approval] = await db
    .select({ versionId: renditionApprovals.versionId })
    .from(renditionApprovals)
    .where(
      and(
        eq(renditionApprovals.documentId, documentId),
        eq(renditionApprovals.purpose, 'public'),
        isNull(renditionApprovals.revokedAt),
      ),
    )
  const approved = versions.find((v) => v.id === approval?.versionId)
  if (approved === undefined) return undefined
  return approved.role === 'original' ? defaultOriginal(latest, textLayers) : approved
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
  rendition: Rendition,
  latest: (role: ResolvedRendition['role']) => T | undefined,
  textLayers: ReadonlyMap<string, boolean>,
): T | undefined {
  if (rendition === 'pdfa') return latest('pdfa')
  return defaultOriginal(latest, textLayers)
}
