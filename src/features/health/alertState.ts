import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { healthAlerts } from '@/db/schema'
import type { EvaluatedAlert } from './evaluateAlerts'

export interface AlertEvent {
  key: string
  kind: EvaluatedAlert['kind']
  severity: EvaluatedAlert['severity']
  summary: string
  state: 'firing' | 'resolved'
}

const NOTIFY_AGAIN_MS = 24 * 60 * 60 * 1000

export async function syncAlerts(
  db: DbOrTx,
  evaluated: EvaluatedAlert[],
  now: Date,
  signal: AbortSignal,
): Promise<AlertEvent[]> {
  signal.throwIfAborted()
  const existing = new Map((await db.select().from(healthAlerts)).map((r) => [r.key, r]))
  const events: AlertEvent[] = []
  const firingKeys = new Set(evaluated.map((a) => a.key))
  for (const alert of evaluated) {
    const row = existing.get(alert.key)
    const wasFiring = row?.state === 'firing'
    await db
      .insert(healthAlerts)
      .values({
        ...alert,
        state: 'firing',
        firstSeenAt: now,
        lastSeenAt: now,
        lastNotifiedAt: null,
        resolvedAt: null,
      })
      .onConflictDoUpdate({
        target: healthAlerts.key,
        set: {
          kind: alert.kind,
          severity: alert.severity,
          summary: alert.summary,
          state: 'firing',
          lastSeenAt: now,
          ...(wasFiring ? {} : { firstSeenAt: now, lastNotifiedAt: null, resolvedAt: null }),
        },
      })
    const lastNotified = row?.state === 'firing' ? row.lastNotifiedAt : null
    const due = lastNotified === null || now.getTime() - lastNotified.getTime() >= NOTIFY_AGAIN_MS
    if (due) events.push({ ...alert, state: 'firing' })
  }
  for (const row of existing.values()) {
    if (row.state !== 'firing' || firingKeys.has(row.key)) continue
    await db
      .update(healthAlerts)
      .set({ state: 'resolved', resolvedAt: now, lastSeenAt: now })
      .where(eq(healthAlerts.key, row.key))
    events.push({
      key: row.key,
      kind: row.kind,
      severity: row.severity,
      summary: row.summary,
      state: 'resolved',
    })
  }
  return events
}

export async function markNotified(
  db: DbOrTx,
  key: string,
  now: Date,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  await db.update(healthAlerts).set({ lastNotifiedAt: now }).where(eq(healthAlerts.key, key))
}
