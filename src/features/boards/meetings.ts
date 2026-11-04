import type { Board } from '@packs/nh/schema'
import { asc, eq } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { boardMeetings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  boardMeetingCalendar,
  type MeetingCalendar,
  nextRegularMeeting,
} from '@/features/boards/calendar'
import { recomputeMeetingBoundClocks } from '@/features/clocks/recomputeMeetingBound'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type MeetingRow = typeof boardMeetings.$inferSelect

export { boardMeetingCalendar, type MeetingCalendar, nextRegularMeeting }

export async function listMeetings(
  db: DbOrTx,
  board: Board,
  signal: AbortSignal,
): Promise<MeetingRow[]> {
  signal.throwIfAborted()
  return await db
    .select()
    .from(boardMeetings)
    .where(eq(boardMeetings.board, board))
    .orderBy(asc(boardMeetings.meetingDate))
}

export async function getMeeting(
  db: DbOrTx,
  meetingId: string,
  signal: AbortSignal,
): Promise<MeetingRow | null> {
  signal.throwIfAborted()
  const [row] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
  return row ?? null
}

export async function scheduleMeeting(
  db: Db,
  actor: Actor,
  input: {
    board: Board
    meetingDate: CivilDate
    kind: 'regular' | 'special'
    location?: string
    startsAtMinute?: number
  },
  signal: AbortSignal,
): Promise<Result<{ meetingId: string }, 'forbidden' | 'already_scheduled'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult(db, async (tx: Tx) => {
    const [row] = await tx
      .insert(boardMeetings)
      .values({
        board: input.board,
        meetingDate: input.meetingDate,
        kind: input.kind,
        location: input.location ?? '',
        startsAtMinute: input.startsAtMinute ?? 1140,
        createdBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ id: boardMeetings.id })
    if (row === undefined) return err('already_scheduled')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.meeting.schedule',
        entityType: 'board_meeting',
        entityId: row.id,
        after: { board: input.board, meetingDate: input.meetingDate, kind: input.kind },
      },
      signal,
    )
    if (input.kind === 'regular') await recomputeMeetingBoundClocks(tx, input.board, signal)
    return ok({ meetingId: row.id })
  })
}

export async function cancelMeeting(
  db: Db,
  actor: Actor,
  input: { meetingId: string; reason: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<void, 'forbidden' | 'not_found' | 'reason_required' | 'already_cancelled' | 'meeting_past'>
> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const reason = input.reason.trim()
  if (reason === '') return err('reason_required')
  return await transactionResult(db, async (tx: Tx) => {
    const meeting = await getMeeting(tx, input.meetingId, signal)
    if (meeting === null) return err('not_found')
    if (meeting.status === 'cancelled') return err('already_cancelled')
    if (meeting.meetingDate < (await townToday(tx, now, signal))) return err('meeting_past')
    await tx
      .update(boardMeetings)
      .set({ status: 'cancelled', cancelReason: reason })
      .where(eq(boardMeetings.id, meeting.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.meeting.cancel',
        entityType: 'board_meeting',
        entityId: meeting.id,
        before: { status: 'scheduled' },
        after: { status: 'cancelled', reason },
      },
      signal,
    )
    if (meeting.kind === 'regular') await recomputeMeetingBoundClocks(tx, meeting.board, signal)
    return ok(undefined)
  })
}
