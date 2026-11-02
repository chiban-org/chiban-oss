import { and, eq, inArray } from 'drizzle-orm'
import type { Capability } from '@/constants/capabilities'
import type { DbOrTx } from '@/db/client'
import { roleCapabilities, userRoles, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { NAV_CAPABILITIES, type NavViewer } from '@/features/staffNav/navItems'

export async function loadNavViewer(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<NavViewer> {
  signal.throwIfAborted()
  const rows = await db
    .selectDistinct({ capability: roleCapabilities.capability })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roleCapabilities, eq(roleCapabilities.role, userRoles.role))
    .where(
      and(
        eq(users.id, actor.userId),
        eq(users.isActive, true),
        inArray(roleCapabilities.capability, [...NAV_CAPABILITIES]),
      ),
    )
  return { roles: actor.roles, capabilities: new Set(rows.map((r) => r.capability as Capability)) }
}
