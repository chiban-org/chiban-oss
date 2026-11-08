import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { reportScheduleDeliveries, reportSchedules } from '@/db/schema'
import { actorFor } from '@/features/demo/seedPermitSupport'
import { periodBefore } from '@/features/reports/schedulePeriod'
import { createSchedule, setSchedulePaused } from '@/features/reports/schedules'
import { addMonthsClamped } from '@/types/civilDate'

export async function seedReportSchedules(
  db: Db,
  now: Date,
  signal: AbortSignal,
): Promise<boolean> {
  const [existing] = await db.select({ id: reportSchedules.id }).from(reportSchedules).limit(1)
  if (existing !== undefined) return false
  const staff = await actorFor(db, 'staff', signal)
  const admin = await actorFor(db, 'admin', signal)
  const finance = await actorFor(db, 'finance', signal)
  const monthly = await createSchedule(
    db,
    staff,
    {
      report: 'permit-volume',
      frequency: 'monthly',
      recipientIds: [staff.userId, admin.userId],
      now,
    },
    signal,
  )
  const weekly = await createSchedule(
    db,
    finance,
    { report: 'cash-receipts', frequency: 'weekly', recipientIds: [finance.userId], now },
    signal,
  )
  if (!monthly.ok || !weekly.ok) return false
  await setSchedulePaused(db, finance, { id: weekly.value.id, paused: true, now }, signal)
  const [row] = await db
    .select()
    .from(reportSchedules)
    .where(eq(reportSchedules.id, monthly.value.id))
  if (row === undefined) return false
  const lastRun = addMonthsClamped(row.nextRunOn as ReturnType<typeof addMonthsClamped>, -1)
  const period = periodBefore('monthly', lastRun)
  const sentAt = new Date(`${lastRun}T11:00:00Z`)
  await db.insert(reportScheduleDeliveries).values(
    [staff.userId, admin.userId].map((userId) => ({
      scheduleId: row.id,
      userId,
      report: row.report,
      periodFrom: period.from,
      periodTo: period.to,
      outcome: 'sent' as const,
      at: sentAt,
    })),
  )
  await db
    .update(reportSchedules)
    .set({ lastSentAt: sentAt, lastPeriodFrom: period.from, lastPeriodTo: period.to })
    .where(eq(reportSchedules.id, row.id))
  return true
}
