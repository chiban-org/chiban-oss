import type { Board } from '@packs/nh/schema'
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  agendaItems,
  auditLog,
  documents,
  documentVersions,
  hearings,
  renditionApprovals,
} from '@/db/schema'
import { documentOwners } from '@/features/boards/documentBoard'
import { type FrozenVersion, frozenVersion } from '@/features/boards/packets'

export type Exclusion =
  | { kind: 'not_shared' }
  | { kind: 'other_board'; board: Board }
  | { kind: 'no_public_copy' }

export interface Candidate {
  documentId: string
  title: string
  groupKey: string
  frozen: FrozenVersion | null
  exclusion: Exclusion | null
}

export interface CandidateGroup {
  key: string
  heading: string
  applicationId: string | null
}

export const MEETING_GROUP = 'meeting'
export const TRC_SUMMARY_TITLE = 'Technical Review Committee summary'

export function exclusionOf(
  doc: { isPublic: boolean },
  frozen: FrozenVersion | null,
  owner: Board | null,
  meetingBoard: Board,
): Exclusion | null {
  if (owner !== null && owner !== meetingBoard) return { kind: 'other_board', board: owner }
  if (frozen !== null) return null
  return doc.isPublic ? { kind: 'no_public_copy' } : { kind: 'not_shared' }
}

async function agendaGroups(db: DbOrTx, meetingId: string): Promise<CandidateGroup[]> {
  const rows = await db
    .select({ title: agendaItems.title, applicationId: hearings.applicationId })
    .from(agendaItems)
    .innerJoin(hearings, eq(hearings.id, agendaItems.hearingId))
    .where(eq(agendaItems.meetingId, meetingId))
    .orderBy(asc(agendaItems.position))
  const seen = new Set<string>()
  const groups: CandidateGroup[] = [{ key: MEETING_GROUP, heading: 'Meeting', applicationId: null }]
  for (const row of rows) {
    if (seen.has(row.applicationId)) continue
    seen.add(row.applicationId)
    groups.push({ key: row.applicationId, heading: row.title, applicationId: row.applicationId })
  }
  return groups
}

export async function agendaDocumentIds(db: DbOrTx, meetingId: string): Promise<Set<string>> {
  const rows = await db
    .select({ documentId: sql<string>`${auditLog.after} ->> 'documentId'` })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'agenda.publish'), eq(auditLog.entityId, meetingId)))
  return new Set(rows.map((r) => r.documentId))
}

async function frozenVersions(db: DbOrTx, documentIds: string[]) {
  const versions = await db
    .select()
    .from(documentVersions)
    .where(inArray(documentVersions.documentId, documentIds))
  const approvals = await db
    .select({
      id: renditionApprovals.id,
      documentId: renditionApprovals.documentId,
      versionId: renditionApprovals.versionId,
    })
    .from(renditionApprovals)
    .where(
      and(
        inArray(renditionApprovals.documentId, documentIds),
        eq(renditionApprovals.purpose, 'public'),
        isNull(renditionApprovals.revokedAt),
      ),
    )
  return { versions, approvals: new Map(approvals.map((a) => [a.documentId, a])) }
}

export async function packetCandidates(
  db: DbOrTx,
  meeting: { id: string; board: Board },
  currentAgendaId: string | null,
  signal: AbortSignal,
): Promise<{ groups: CandidateGroup[]; candidates: Candidate[] }> {
  signal.throwIfAborted()
  const groups = await agendaGroups(db, meeting.id)
  const applicationIds = groups.flatMap((g) => (g.applicationId === null ? [] : [g.applicationId]))
  const oldAgendas = await agendaDocumentIds(db, meeting.id)
  if (currentAgendaId !== null) oldAgendas.delete(currentAgendaId)
  const docs = await db
    .select()
    .from(documents)
    .where(
      or(
        and(eq(documents.recordKind, 'meeting'), eq(documents.recordId, meeting.id)),
        applicationIds.length === 0
          ? sql`false`
          : and(
              eq(documents.recordKind, 'application'),
              inArray(documents.recordId, applicationIds),
            ),
      ),
    )
    .orderBy(asc(documents.seq))
  const listed = docs.filter((d) => !oldAgendas.has(d.id))
  if (listed.length === 0) return { groups, candidates: [] }
  const { versions, approvals } = await frozenVersions(
    db,
    listed.map((d) => d.id),
  )
  const ownerOf = documentOwners(db, signal)
  const candidates: Candidate[] = []
  for (const doc of listed) {
    const frozen = frozenVersion(
      doc,
      versions.filter((v) => v.documentId === doc.id),
      approvals.get(doc.id) ?? null,
    )
    const owner = await ownerOf(doc)
    candidates.push({
      documentId: doc.id,
      title: doc.title,
      groupKey: doc.recordKind === 'meeting' ? MEETING_GROUP : doc.recordId,
      frozen,
      exclusion: exclusionOf(doc, frozen, owner?.board ?? null, meeting.board),
    })
  }
  return { groups, candidates }
}
