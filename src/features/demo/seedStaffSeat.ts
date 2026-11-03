import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMemberships } from '@/db/schema'
import { actorFor, type Cast, d } from '@/features/demo/seedPermitSupport'

export async function seatStaffBoardMember(db: Db, cast: Cast, signal: AbortSignal): Promise<void> {
  const member = await actorFor(db, 'board', signal)
  const [seated] = await db
    .select({ id: boardMemberships.id })
    .from(boardMemberships)
    .where(and(eq(boardMemberships.userId, member.userId), eq(boardMemberships.board, 'zba')))
  if (seated !== undefined) return
  await db.insert(boardMemberships).values({
    userId: member.userId,
    board: 'zba',
    title: 'member',
    termStart: d('2026-01-01'),
    createdBy: cast.admin.userId,
  })
}
