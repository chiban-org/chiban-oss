import { and, count, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { agendas, boardMeetings, hearings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export type MeetingEditError = 'forbidden' | 'not_found' | 'already_cancelled' | 'meeting_past'

export interface MeetingEdited {
  timeChanged: boolean
  agendaReopened: boolean
  hearings: number
}

async function reopenPublishedAgenda(tx: Tx, meetingId: string): Promise<boolean> {
  const reopened = await tx
    .update(agendas)
    .set({ status: 'draft' })
    .where(and(eq(agendas.meetingId, meetingId), eq(agendas.status, 'published')))
    .returning({ meetingId: agendas.meetingId })
  return reopened.length > 0
}

async function activeHearings(tx: Tx, meetingId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(hearings)
    .where(and(eq(hearings.meetingId, meetingId), eq(hearings.status, 'scheduled')))
  return row?.n ?? 0
}

export async function updateMeetingDetails(
  db: Db,
  actor: Actor,
  input: { meetingId: string; startsAtMinute: number; location: string; now?: Date },
  signal: AbortSignal,
): Promise<Result<MeetingEdited, MeetingEditError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<MeetingEdited, MeetingEditError>(db, async (tx) => {
    const [meeting] = await tx
      .select()
      .from(boardMeetings)
      .where(eq(boardMeetings.id, input.meetingId))
      .for('update')
    if (meeting === undefined) return err('not_found')
    if (meeting.status === 'cancelled') return err('already_cancelled')
    if (meeting.meetingDate < (await townToday(tx, input.now ?? new Date(), signal)))
      return err('meeting_past')
    const location = input.location.trim()
    await tx
      .update(boardMeetings)
      .set({ startsAtMinute: input.startsAtMinute, location })
      .where(eq(boardMeetings.id, meeting.id))
    const timeChanged = meeting.startsAtMinute !== input.startsAtMinute
    const agendaReopened = timeChanged && (await reopenPublishedAgenda(tx, meeting.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.meeting.update',
        entityType: 'board_meeting',
        entityId: meeting.id,
        before: { startsAtMinute: meeting.startsAtMinute, location: meeting.location },
        after: { startsAtMinute: input.startsAtMinute, location },
      },
      signal,
    )
    return ok({
      timeChanged,
      agendaReopened,
      hearings: timeChanged ? await activeHearings(tx, meeting.id) : 0,
    })
  })
}
