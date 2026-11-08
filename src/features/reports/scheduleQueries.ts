import { asc, desc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { reportScheduleRecipients, reportSchedules, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  canUseReport,
  SCHEDULE_CAPABILITY,
  type ScheduledReport,
} from '@/features/reports/scheduleAccess'
import type { ScheduleFrequency } from '@/features/reports/schedulePeriod'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export interface ScheduleView {
  id: string
  report: ScheduledReport
  frequency: ScheduleFrequency
  paused: boolean
  nextRunOn: string
  lastSentAt: Date | null
  lastPeriodFrom: string | null
  lastPeriodTo: string | null
  recipients: { id: string; name: string }[]
}

type ScheduleRow = typeof reportSchedules.$inferSelect

async function recipientsOf(
  db: DbOrTx,
  ids: string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const byId = new Map<string, { id: string; name: string }[]>()
  if (ids.length === 0) return byId
  const rows = await db
    .select({
      scheduleId: reportScheduleRecipients.scheduleId,
      id: users.id,
      name: users.displayName,
    })
    .from(reportScheduleRecipients)
    .innerJoin(users, eq(users.id, reportScheduleRecipients.userId))
    .where(inArray(reportScheduleRecipients.scheduleId, ids))
    .orderBy(asc(users.displayName), asc(users.id))
  for (const row of rows) {
    byId.set(row.scheduleId, [...(byId.get(row.scheduleId) ?? []), { id: row.id, name: row.name }])
  }
  return byId
}

function toView(row: ScheduleRow, recipients: { id: string; name: string }[]): ScheduleView {
  return {
    id: row.id,
    report: row.report,
    frequency: row.frequency,
    paused: row.paused,
    nextRunOn: row.nextRunOn,
    lastSentAt: row.lastSentAt,
    lastPeriodFrom: row.lastPeriodFrom,
    lastPeriodTo: row.lastPeriodTo,
    recipients,
  }
}

async function usableReports(
  db: DbOrTx,
  actor: Actor,
  rows: ScheduleRow[],
  signal: AbortSignal,
): Promise<ScheduleRow[]> {
  const allowed = new Map<ScheduledReport, boolean>()
  const kept: ScheduleRow[] = []
  for (const row of rows) {
    const known = allowed.get(row.report)
    const may = known ?? (await canUseReport(db, actor.userId, row.report, signal))
    allowed.set(row.report, may)
    if (may) kept.push(row)
  }
  return kept
}

export async function listSchedules(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<ScheduleView[], 'forbidden'>> {
  if (!(await hasCapability(db, actor.userId, SCHEDULE_CAPABILITY, signal))) {
    return err('forbidden')
  }
  const rows = await db
    .select()
    .from(reportSchedules)
    .orderBy(asc(reportSchedules.report), desc(reportSchedules.createdAt))
  const kept = await usableReports(db, actor, rows, signal)
  const recipients = await recipientsOf(
    db,
    kept.map((r) => r.id),
  )
  return ok(kept.map((r) => toView(r, recipients.get(r.id) ?? [])))
}

export async function getSchedule(
  db: DbOrTx,
  actor: Actor,
  id: string,
  signal: AbortSignal,
): Promise<Result<ScheduleView, 'forbidden' | 'not_found'>> {
  if (!(await hasCapability(db, actor.userId, SCHEDULE_CAPABILITY, signal))) {
    return err('forbidden')
  }
  if (!isUuid(id)) return err('not_found')
  const [row] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, id))
  if (row === undefined) return err('not_found')
  if (!(await canUseReport(db, actor.userId, row.report, signal))) return err('forbidden')
  const recipients = await recipientsOf(db, [row.id])
  return ok(toView(row, recipients.get(row.id) ?? []))
}
