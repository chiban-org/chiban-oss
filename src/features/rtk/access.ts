import { type SQL, sql } from 'drizzle-orm'
import { hasFullRecordAccess } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'

export function rtkRequestVisibleTo(actor: Actor | null): SQL {
  return actor !== null && hasFullRecordAccess(actor) ? sql`true` : sql`false`
}
