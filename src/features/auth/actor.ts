import { eq } from 'drizzle-orm'
import { ROLES, type Role } from '@/constants/roles'
import type { DbOrTx } from '@/db/client'
import { userRoles, users } from '@/db/schema'

export interface Actor {
  userId: string
  kind: 'staff' | 'public'
  roles: Role[]
}

const KNOWN_ROLES: ReadonlySet<string> = new Set(ROLES)

export async function loadActor(
  db: DbOrTx,
  userId: string,
  signal: AbortSignal,
): Promise<Actor | null> {
  signal.throwIfAborted()
  const [user] = await db
    .select({ id: users.id, kind: users.kind, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (user?.isActive !== true) return null
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  const roles = rows.map((r) => r.role).filter((r): r is Role => KNOWN_ROLES.has(r))
  return { userId: user.id, kind: user.kind, roles }
}
