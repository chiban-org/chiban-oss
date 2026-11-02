import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { projectParties } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'

const FULL_ACCESS_ROLES = ['admin', 'staff', 'inspector', 'finance', 'records_custodian'] as const

export function hasFullRecordAccess(actor: Actor): boolean {
  return actor.kind === 'staff' && actor.roles.some((r) => FULL_ACCESS_ROLES.includes(r as never))
}

export async function isActiveParty(
  db: DbOrTx,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: projectParties.id })
    .from(projectParties)
    .where(
      and(
        eq(projectParties.projectId, projectId),
        eq(projectParties.userId, userId),
        isNull(projectParties.removedAt),
      ),
    )
    .limit(1)
  return rows.length > 0
}
