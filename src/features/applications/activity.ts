import { and, desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { auditLog, users } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { activityPhrase } from '@/features/applications/activityPhrase'
import type { Actor } from '@/features/auth/actor'

export const ACTIVITY_LIMIT = 10

export interface ActivityEntry {
  id: string
  at: Date
  who: string
  what: string
}

function whoDid(row: { actorKind: string; name: string | null }): string {
  if (row.actorKind === 'system') return 'Chiban, automatically'
  if (row.actorKind === 'anonymous_public_intake') return 'A member of the public'
  return row.name ?? 'Former user'
}

export async function recentApplicationActivity(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<ActivityEntry[]> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return []
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      after: auditLog.after,
      actorKind: auditLog.actorKind,
      name: users.displayName,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(and(eq(auditLog.entityType, 'application'), eq(auditLog.entityId, applicationId)))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(ACTIVITY_LIMIT)
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    who: whoDid(r),
    what: activityPhrase(r.action, r.after),
  }))
}
