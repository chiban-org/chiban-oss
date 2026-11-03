import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  documents,
  documentVersions,
  renditionApprovals,
  rtkReleaseItems,
  rtkReleases,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { rtkRequestVisibleTo } from '@/features/rtk/access'

const CANDIDATE_LIMIT = 25
const MIN_QUERY = 2

const RECORD_KIND_LABELS: Record<string, string> = {
  application: 'Application',
  enforcement_case: 'Case',
  parcel: 'Parcel file',
  inspection: 'Inspection',
  project: 'Project',
  meeting: 'Board meeting',
}

export interface ReleaseCandidate {
  documentId: string
  title: string
  context: string
  versions: { id: string; role: string; filename: string; createdAt: string }[]
}

export interface RequestApproval {
  approvalId: string
  documentId: string
  versionId: string
  title: string
  role: string
  revokedAt: Date | null
}

export interface ReleaseSummary {
  id: string
  sequence: number
  releasedOn: string
  method: (typeof rtkReleases.$inferSelect)['method']
  letterDocumentId: string | null
  items: { title: string; filename: string; withdrawn: boolean }[]
}

const RECORD_NUMBER = sql<string | null>`coalesce(
  (select a.number from applications a
    where ${documents.recordKind} = 'application' and a.id = ${documents.recordId}),
  (select c.number from enforcement_cases c
    where ${documents.recordKind} = 'enforcement_case' and c.id = ${documents.recordId}))`

export async function loadReleaseCandidates(
  db: Db,
  actor: Actor,
  query: string,
): Promise<ReleaseCandidate[]> {
  const term = query.trim()
  if (term.length < MIN_QUERY) return []
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      recordKind: documents.recordKind,
      recordNumber: RECORD_NUMBER,
    })
    .from(documents)
    .where(
      and(
        isNull(documents.disposedAt),
        sql`${documents.recordKind} <> 'rtk_request'`,
        rtkRequestVisibleTo(actor),
        sql`(${documents.title} ilike ${like} or ${RECORD_NUMBER} ilike ${like})`,
      ),
    )
    .orderBy(desc(documents.seq))
    .limit(CANDIDATE_LIMIT)
  if (rows.length === 0) return []
  const versions = await db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      role: documentVersions.role,
      filename: documentVersions.filename,
      createdAt: documentVersions.createdAt,
    })
    .from(documentVersions)
    .where(
      and(
        inArray(
          documentVersions.documentId,
          rows.map((r) => r.id),
        ),
        or(
          eq(documentVersions.role, 'original'),
          eq(documentVersions.role, 'public_redacted'),
          eq(documentVersions.role, 'release_redacted'),
        ),
      ),
    )
    .orderBy(asc(documentVersions.createdAt))
  return rows.map((r) => ({
    documentId: r.id,
    title: r.title,
    context: [RECORD_KIND_LABELS[r.recordKind] ?? 'Record', r.recordNumber]
      .filter((x) => x !== null)
      .join(' '),
    versions: versions
      .filter((v) => v.documentId === r.id)
      .map(({ createdAt, ...v }) => ({ ...v, createdAt: createdAt.toISOString() })),
  }))
}

export async function loadRequestApprovals(db: Db, requestId: string): Promise<RequestApproval[]> {
  return await db
    .select({
      approvalId: renditionApprovals.id,
      documentId: renditionApprovals.documentId,
      versionId: renditionApprovals.versionId,
      title: documents.title,
      role: documentVersions.role,
      revokedAt: renditionApprovals.revokedAt,
    })
    .from(renditionApprovals)
    .innerJoin(documents, eq(documents.id, renditionApprovals.documentId))
    .innerJoin(documentVersions, eq(documentVersions.id, renditionApprovals.versionId))
    .where(
      and(
        eq(renditionApprovals.purpose, 'rtk_release'),
        eq(renditionApprovals.rtkRequestId, requestId),
      ),
    )
    .orderBy(asc(renditionApprovals.approvedAt))
}

export async function loadReleases(db: Db, requestId: string): Promise<ReleaseSummary[]> {
  const releases = await db
    .select()
    .from(rtkReleases)
    .where(eq(rtkReleases.requestId, requestId))
    .orderBy(asc(rtkReleases.sequence))
  const out: ReleaseSummary[] = []
  for (const release of releases) {
    const items = await db
      .select({
        title: documents.title,
        filename: documentVersions.filename,
        withdrawnAt: rtkReleaseItems.withdrawnAt,
      })
      .from(rtkReleaseItems)
      .innerJoin(documents, eq(documents.id, rtkReleaseItems.documentId))
      .leftJoin(documentVersions, eq(documentVersions.id, rtkReleaseItems.versionId))
      .where(eq(rtkReleaseItems.releaseId, release.id))
      .orderBy(asc(rtkReleaseItems.position))
    out.push({
      id: release.id,
      sequence: release.sequence,
      releasedOn: release.releasedOn,
      method: release.method,
      letterDocumentId: release.letterDocumentId,
      items: items.map((i) => ({
        title: i.title,
        filename: i.filename ?? '',
        withdrawn: i.withdrawnAt !== null,
      })),
    })
  }
  return out
}

export async function loadRequestLetters(db: Db, requestId: string) {
  return await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(and(eq(documents.recordKind, 'rtk_request'), eq(documents.recordId, requestId)))
    .orderBy(asc(documents.seq))
}

export async function releaseSearchExample(db: Db, actor: Actor): Promise<string | null> {
  const [row] = await db
    .select({ number: RECORD_NUMBER })
    .from(documents)
    .where(
      and(
        isNull(documents.disposedAt),
        rtkRequestVisibleTo(actor),
        sql`${RECORD_NUMBER} is not null`,
      ),
    )
    .orderBy(desc(documents.seq))
    .limit(1)
  return row?.number ?? null
}
