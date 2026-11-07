import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings } from '@/db/schema'
import { boardIdOf } from '@/features/boards/townBoards'

export async function packetMeeting(
  db: Db,
  board: 'planning_board' | 'zba',
  meetingDate: string,
): Promise<string> {
  const boardId = await boardIdOf(db, board)
  await db
    .insert(boardMeetings)
    .values({ boardId, meetingDate, kind: 'regular', createdBy: randomUUID() })
    .onConflictDoNothing()
  const [row] = await db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.boardId, boardId),
        eq(boardMeetings.meetingDate, meetingDate),
        eq(boardMeetings.kind, 'regular'),
        eq(boardMeetings.status, 'scheduled'),
      ),
    )
  return row?.id ?? ''
}
