import { and, eq, ne } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { boardMemberships, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { MemberTitle } from '@/features/boards/members'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface MemberChange {
  membershipId: string
  displayName: string
  email: string
  board: 'planning_board' | 'zba'
  title: MemberTitle
  termStart: CivilDate
  termEnd: CivilDate | null
}

export type MemberEditError =
  | 'forbidden'
  | 'not_found'
  | 'name_required'
  | 'term_order'
  | 'email_taken'
  | 'staff_account'

async function emailProblem(
  tx: DbOrTx,
  userId: string,
  email: string,
): Promise<'email_taken' | 'staff_account' | null> {
  const [other] = await tx
    .select({ kind: users.kind })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, userId)))
  if (other === undefined) return null
  return other.kind === 'staff' ? 'staff_account' : 'email_taken'
}

function invalid(input: MemberChange): MemberEditError | null {
  if (input.displayName.trim() === '' || input.email.trim() === '') return 'name_required'
  if (input.termEnd !== null && input.termEnd < input.termStart) return 'term_order'
  return null
}

export async function updateBoardMember(
  db: Db,
  actor: Actor,
  input: MemberChange,
  signal: AbortSignal,
): Promise<Result<void, MemberEditError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.manage_members', signal))) {
    return err('forbidden')
  }
  const problem = invalid(input)
  if (problem !== null) return err(problem)
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  return await transactionResult<void, MemberEditError>(db, async (tx) => {
    const [current] = await tx
      .select({ m: boardMemberships, name: users.displayName, email: users.email })
      .from(boardMemberships)
      .innerJoin(users, eq(users.id, boardMemberships.userId))
      .where(eq(boardMemberships.id, input.membershipId))
      .for('update')
    if (current === undefined) return err('not_found')
    const userId = current.m.userId
    const taken = await emailProblem(tx, userId, email)
    if (taken !== null) return err(taken)
    await tx.update(users).set({ displayName, email }).where(eq(users.id, userId))
    const change = {
      board: input.board,
      title: input.title,
      termStart: input.termStart,
      termEnd: input.termEnd,
    }
    await tx.update(boardMemberships).set(change).where(eq(boardMemberships.id, input.membershipId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.member.update',
        entityType: 'user',
        entityId: userId,
        before: {
          membershipId: input.membershipId,
          displayName: current.name,
          email: current.email,
          board: current.m.board,
          title: current.m.title,
          termStart: current.m.termStart,
          termEnd: current.m.termEnd,
        },
        after: { membershipId: input.membershipId, displayName, email, ...change },
      },
      signal,
    )
    return ok(undefined)
  })
}
