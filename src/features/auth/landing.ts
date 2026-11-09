import { and, eq, isNull, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { projectParties } from '@/db/schema'
import { isBoardMember } from '@/features/access/predicates'
import type { Actor } from '@/features/auth/actor'

export const PORTAL_HOME = '/portal'
const BOARD_HOME = '/board'
const CONTRACTOR_HOME = '/portal/contractor'

async function hasParty(db: DbOrTx, userId: string, contractor: boolean): Promise<boolean> {
  const rows = await db
    .select({ id: projectParties.id })
    .from(projectParties)
    .where(
      and(
        eq(projectParties.userId, userId),
        isNull(projectParties.removedAt),
        contractor ? eq(projectParties.role, 'contractor') : ne(projectParties.role, 'contractor'),
      ),
    )
    .limit(1)
  return rows.length > 0
}

export async function landingFor(
  db: DbOrTx,
  actor: Actor | null,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  if (actor === null) return PORTAL_HOME
  if (isBoardMember(actor)) return BOARD_HOME
  if (await hasParty(db, actor.userId, false)) return PORTAL_HOME
  return (await hasParty(db, actor.userId, true)) ? CONTRACTOR_HOME : PORTAL_HOME
}
