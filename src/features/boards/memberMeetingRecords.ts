import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, boardDecisions, documents, meetingMinutes } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { documentVisibleTo } from '@/features/documents/visibility'
import { formatCivilDate } from '@/lib/formatDate'

export interface MeetingRecordLink {
  key: string
  label: string
  documentId: string
}

function add(map: Map<string, MeetingRecordLink[]>, meetingId: string, link: MeetingRecordLink) {
  map.set(meetingId, [...(map.get(meetingId) ?? []), link])
}

interface RecordQuery {
  actor: Actor
  meetingIds: string[]
  signal: AbortSignal
}

async function minutesLinks(db: Db, input: RecordQuery, out: Map<string, MeetingRecordLink[]>) {
  const rows = await db
    .select({
      meetingId: meetingMinutes.meetingId,
      documentId: meetingMinutes.documentId,
      approvedOn: meetingMinutes.approvedOn,
    })
    .from(meetingMinutes)
    .innerJoin(documents, eq(documents.id, meetingMinutes.documentId))
    .where(
      and(
        inArray(meetingMinutes.meetingId, input.meetingIds),
        eq(meetingMinutes.status, 'approved'),
        documentVisibleTo(input.actor),
      ),
    )
  for (const row of rows) {
    add(out, row.meetingId, {
      key: `minutes-${row.documentId}`,
      label:
        row.approvedOn === null
          ? 'Minutes'
          : `Minutes, approved ${formatCivilDate(row.approvedOn)}`,
      documentId: row.documentId,
    })
  }
}

async function decisionLinks(db: Db, input: RecordQuery, out: Map<string, MeetingRecordLink[]>) {
  const rows = await db
    .select({ decision: boardDecisions, number: applications.number })
    .from(boardDecisions)
    .innerJoin(applications, eq(applications.id, boardDecisions.applicationId))
    .innerJoin(documents, eq(documents.id, boardDecisions.writtenDecisionDocumentId))
    .where(
      and(
        inArray(boardDecisions.meetingId, input.meetingIds),
        isNotNull(boardDecisions.filedOn),
        documentVisibleTo(input.actor),
      ),
    )
    .orderBy(asc(applications.number))
  const ids = [...new Set(rows.map((r) => r.decision.applicationId))]
  const contexts = await Promise.all(ids.map((id) => loadApplicationContext(db, id, input.signal)))
  const labelOf = new Map(ids.map((id, i) => [id, contexts[i]?.typeBody.label ?? 'Application']))
  for (const { decision, number } of rows) {
    if (decision.writtenDecisionDocumentId === null) continue
    add(out, decision.meetingId, {
      key: `decision-${decision.id}`,
      label: `Notice of Decision, ${labelOf.get(decision.applicationId) ?? 'Application'} ${number}: ${OUTCOME_LABELS[decision.outcome]}`,
      documentId: decision.writtenDecisionDocumentId,
    })
  }
}

export async function memberMeetingRecords(
  db: Db,
  input: RecordQuery,
): Promise<Map<string, MeetingRecordLink[]>> {
  input.signal.throwIfAborted()
  const out = new Map<string, MeetingRecordLink[]>()
  if (input.meetingIds.length === 0) return out
  await minutesLinks(db, input, out)
  await decisionLinks(db, input, out)
  return out
}
