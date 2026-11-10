import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMemberships } from '@/db/schema'
import { boardIdOf } from '@/features/boards/townBoards'
import { storyDay } from '@/features/demo/seedCalendar'
import { actorFor, type Cast, d } from '@/features/demo/seedPermitSupport'

export async function seatStaffBoardMember(db: Db, cast: Cast, signal: AbortSignal): Promise<void> {
  const member = await actorFor(db, 'board', signal)
  const boardId = await boardIdOf(db, 'zba')
  const [seated] = await db
    .select({ id: boardMemberships.id })
    .from(boardMemberships)
    .where(and(eq(boardMemberships.userId, member.userId), eq(boardMemberships.boardId, boardId)))
  if (seated !== undefined) return
  await db.insert(boardMemberships).values({
    userId: member.userId,
    boardId,
    title: 'member',
    termStart: storyDay('2026-01-01'),
    createdBy: cast.admin.userId,
  })
}
