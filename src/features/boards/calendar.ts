import type { BoardKind } from '@packs/nh/boardSchema'
import { and, asc, eq, gte, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { boardMeetings, boards } from '@/db/schema'
import type { CivilDate } from '@/types/civilDate'

export interface MeetingCalendar {
  nextRegularMeeting(
    boardKind: BoardKind,
    onOrAfter: CivilDate,
    signal: AbortSignal,
  ): Promise<CivilDate | null>
}

export async function nextRegularMeetingOfBoard(
  db: DbOrTx,
  boardId: string,
  onOrAfter: CivilDate,
  signal: AbortSignal,
): Promise<CivilDate | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ meetingDate: boardMeetings.meetingDate })
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.boardId, boardId),
        eq(boardMeetings.kind, 'regular'),
        eq(boardMeetings.status, 'scheduled'),
        gte(boardMeetings.meetingDate, onOrAfter),
      ),
    )
    .orderBy(asc(boardMeetings.meetingDate))
    .limit(1)
  return (row?.meetingDate as CivilDate | undefined) ?? null
}

export async function nextRegularMeeting(
  db: DbOrTx,
  boardKind: BoardKind,
  onOrAfter: CivilDate,
  signal: AbortSignal,
): Promise<CivilDate | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ meetingDate: boardMeetings.meetingDate })
    .from(boardMeetings)
    .innerJoin(boards, eq(boards.id, boardMeetings.boardId))
    .where(
      and(
        eq(boards.kind, boardKind),
        isNull(boards.archivedAt),
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
    nextRegularMeeting: (boardKind, onOrAfter, signal) =>
      nextRegularMeeting(tx, boardKind, onOrAfter, signal),
  }
}
