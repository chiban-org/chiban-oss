import { desc, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { inspections } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'

export function managesAllInspectors(actor: Actor): boolean {
  return actor.kind === 'staff' && (actor.roles.includes('staff') || actor.roles.includes('admin'))
}

export function recordsInspection(actor: Actor, inspectorUserId: string | null): boolean {
  if (inspectorUserId === actor.userId) return true
  return actor.roles.includes('inspector') && actor.roles.includes('staff')
}

export function inspectionVisibleTo(actor: Actor | null): SQL {
  if (actor === null) return sql`false`
  if (hasFullRecordAccess(actor)) return sql`true`
  if (actor.kind !== 'public') return sql`false`
  return sql`exists (
    select 1
    from applications app
    join project_parties pp on pp.project_id = app.project_id
    where app.id = ${inspections.applicationId}
      and pp.user_id = ${actor.userId}
      and pp.removed_at is null
  )`
}

export async function listVisibleInspections(
  db: DbOrTx,
  actor: Actor | null,
  page: { limit: number },
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  return await db
    .select()
    .from(inspections)
    .where(inspectionVisibleTo(actor))
    .orderBy(desc(inspections.requestedAt), desc(inspections.id))
    .limit(page.limit)
}
