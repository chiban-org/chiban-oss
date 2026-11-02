import type { Board } from '@packs/nh/schema'
import { and, asc, eq, gte } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { boardMeetings } from '@/db/schema'
import type { CivilDate } from '@/types/civilDate'

export interface MeetingCalendar {
  nextRegularMeeting(
    board: Board,
    onOrAfter: CivilDate,
    signal: AbortSignal,
  ): Promise<CivilDate | null>
}

export async function nextRegularMeeting(
  db: DbOrTx,
  board: Board,
  onOrAfter: CivilDate,
  signal: AbortSignal,
): Promise<CivilDate | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ meetingDate: boardMeetings.meetingDate })
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.board, board),
        eq(boardMeetings.kind, 'regular'),
        eq(boardMeetings.status, 'scheduled'),
        gte(boardMeetings.meetingDate, onOrAfter),
      ),
    )
    .orderBy(asc(boardMeetings.meetingDate))
    .limit(1)
  return (row?.meetingDate as CivilDate | undefined) ?? null
}

export function boardMeetingCalendar(tx: DbOrTx): MeetingCalendar {
  return {
    nextRegularMeeting: (board, onOrAfter, signal) =>
      nextRegularMeeting(tx, board, onOrAfter, signal),
  }
}
