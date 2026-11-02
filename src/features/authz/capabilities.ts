import { and, eq, sql } from 'drizzle-orm'
import type { Capability } from '@/constants/capabilities'
import type { DbOrTx } from '@/db/client'
import { roleCapabilities, userRoles, users } from '@/db/schema'
import { err, ok, type Result } from '@/types/result'

export async function hasCapability(
  db: DbOrTx,
  userId: string,
  capability: Capability,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(
      roleCapabilities,
      and(eq(roleCapabilities.role, userRoles.role), eq(roleCapabilities.capability, capability)),
    )
    .where(and(eq(users.id, userId), eq(users.isActive, true)))
    .limit(1)
  return rows.length > 0
}

export async function requireCapability(
  db: DbOrTx,
  userId: string,
  capability: Capability,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden'>> {
  const allowed = await hasCapability(db, userId, capability, signal)
  return allowed ? ok(undefined) : err('forbidden')
}
