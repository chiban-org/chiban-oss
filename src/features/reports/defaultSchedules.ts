import { count, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { reportSchedules, userRoles } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { createSchedule } from '@/features/reports/schedules'

export const DEFAULT_SCHEDULED_REPORTS = ['permit-volume', 'processing-time', 'revenue'] as const

async function adminCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: count() }).from(userRoles).where(eq(userRoles.role, 'admin'))
  return row?.n ?? 0
}

export async function ensureDefaultReportSchedules(
  db: Db,
  input: { adminUserId: string; now: Date },
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted()
  const [existing] = await db.select({ id: reportSchedules.id }).from(reportSchedules).limit(1)
  if (existing !== undefined) return 0
  if ((await adminCount(db)) !== 1) return 0
  const admin = await loadActor(db, input.adminUserId, signal)
  if (admin === null) return 0
  let created = 0
  for (const report of DEFAULT_SCHEDULED_REPORTS) {
    const made = await createSchedule(
      db,
      admin,
      { report, frequency: 'monthly', recipientIds: [admin.userId], now: input.now },
      signal,
    )
    if (made.ok) created += 1
  }
  return created
}
