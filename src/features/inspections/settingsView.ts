import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { calendarAccounts, inspectorCalendars, users } from '@/db/schema'
import { listInspectors } from '@/features/inspections/availability'

export interface InspectorTarget {
  userId: string
  name: string
  accountEmail: string
  kind: 'ics_email' | 'graph'
  email: string
  graphUserId: string
}

export async function loadInspectorTargets(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<InspectorTarget[]> {
  const inspectors = await listInspectors(db, signal)
  const out: InspectorTarget[] = []
  for (const inspector of inspectors) {
    const [account] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, inspector.userId))
    const [target] = await db
      .select()
      .from(inspectorCalendars)
      .where(eq(inspectorCalendars.userId, inspector.userId))
    out.push({
      userId: inspector.userId,
      name: inspector.name,
      accountEmail: account?.email ?? '',
      kind: target?.kind ?? 'ics_email',
      email: target?.email ?? account?.email ?? '',
      graphUserId: target?.graphUserId ?? '',
    })
  }
  return out
}

export async function connectedTenant(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<{ tenantId: string; clientId: string } | null> {
  signal.throwIfAborted()
  const [row] = await db.select().from(calendarAccounts).where(eq(calendarAccounts.isActive, true))
  return row === undefined ? null : { tenantId: row.tenantId, clientId: row.clientId }
}
