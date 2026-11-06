import { and, eq, isNull } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { boardMeetings, documents, meetingMinutes } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { approveLatestForPublic } from '@/features/renditions/publicApproval'
import { townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const MINUTES_STATUSES = ['draft', 'approved'] as const
export type MinutesStatus = (typeof MINUTES_STATUSES)[number]

export interface MinutesInput {
  meetingId: string
  documentId: string
  status: MinutesStatus
  approvedOn: CivilDate | null
}

export type MinutesError =
  | 'forbidden'
  | 'not_found'
  | 'meeting_cancelled'
  | 'not_held'
  | 'document_not_found'
  | 'already_approved'
  | 'approval_date_required'
  | 'future_date'
  | 'before_meeting'

export const MINUTES_DOC_KIND = 'attachment'

async function mayRecord(db: Db, actor: Actor, status: MinutesStatus, signal: AbortSignal) {
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return false
  return status === 'draft' || (await hasCapability(db, actor.userId, 'document.publish', signal))
}

export function minutesDocumentsOf(meetingId: string) {
  return and(
    eq(documents.recordKind, 'meeting'),
    eq(documents.recordId, meetingId),
    eq(documents.docKind, MINUTES_DOC_KIND),
    isNull(documents.disposedAt),
  )
}

async function meetingDocument(tx: Tx, meetingId: string, documentId: string): Promise<boolean> {
  const [doc] = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), minutesDocumentsOf(meetingId)))
  return doc !== undefined
}

function dateProblem(
  input: MinutesInput,
  meetingDate: CivilDate,
  today: CivilDate,
): MinutesError | null {
  if (compareCivil(meetingDate, today) > 0) return 'not_held'
  if (input.status === 'draft') return null
  if (input.approvedOn === null) return 'approval_date_required'
  if (compareCivil(input.approvedOn, today) > 0) return 'future_date'
  return compareCivil(input.approvedOn, meetingDate) < 0 ? 'before_meeting' : null
}

async function publish(tx: Tx, actor: Actor, documentId: string, now: Date): Promise<void> {
  await tx
    .update(documents)
    .set({ isPublic: true, publicChangedBy: actor.userId, publicChangedAt: now })
    .where(eq(documents.id, documentId))
  await approveLatestForPublic(tx, [documentId], 'Published when the board approved the minutes.')
}

export async function recordMinutes(
  db: Db,
  actor: Actor,
  input: MinutesInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, MinutesError>> {
  signal.throwIfAborted()
  if (!(await mayRecord(db, actor, input.status, signal))) return err('forbidden')
  return await transactionResult<void, MinutesError>(db, async (tx) => {
    const [meeting] = await tx
      .select({
        id: boardMeetings.id,
        status: boardMeetings.status,
        meetingDate: boardMeetings.meetingDate,
      })
      .from(boardMeetings)
      .where(eq(boardMeetings.id, input.meetingId))
      .for('update')
    if (meeting === undefined) return err('not_found')
    if (meeting.status === 'cancelled') return err('meeting_cancelled')
    const today = await townToday(tx, now, signal)
    const problem = dateProblem(input, meeting.meetingDate as CivilDate, today)
    if (problem !== null) return err(problem)
    if (!(await meetingDocument(tx, meeting.id, input.documentId))) {
      return err('document_not_found')
    }
    const [existing] = await tx
      .select({ status: meetingMinutes.status })
      .from(meetingMinutes)
      .where(eq(meetingMinutes.meetingId, meeting.id))
    if (existing?.status === 'approved') return err('already_approved')
    const row = {
      documentId: input.documentId,
      status: input.status,
      approvedOn: input.status === 'approved' ? input.approvedOn : null,
      recordedBy: actor.userId,
      recordedAt: now,
    }
    await tx
      .insert(meetingMinutes)
      .values({ meetingId: meeting.id, ...row })
      .onConflictDoUpdate({ target: meetingMinutes.meetingId, set: row })
    if (input.status === 'approved') await publish(tx, actor, input.documentId, now)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'meeting.minutes',
        entityType: 'board_meeting',
        entityId: meeting.id,
        after: row,
      },
      signal,
    )
    return ok(undefined)
  })
}
