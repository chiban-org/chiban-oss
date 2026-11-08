import { and, asc, eq, lte } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import {
  reportScheduleDeliveries,
  reportScheduleRecipients,
  reportSchedules,
  users,
} from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import type { MailAttachment, MailTransport } from '@/features/mail/transport'
import { exportFile } from '@/features/reports/exportResponse'
import type { ReportRange } from '@/features/reports/range'
import { buildReportExport } from '@/features/reports/reportExport'
import { scheduledReportMail } from '@/features/reports/scheduleMail'
import { nextRunAfterSend, periodBefore } from '@/features/reports/schedulePeriod'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface SendContext {
  db: DbOrTx
  root: Db
  mail: MailTransport
  signal: AbortSignal
  now: Date
}

type ScheduleRow = typeof reportSchedules.$inferSelect
type Outcome = 'sent' | 'skipped_no_access' | 'failed'

interface Recipient {
  userId: string
  email: string
}

async function alreadyDone(ctx: SendContext, row: ScheduleRow, userId: string, range: ReportRange) {
  const [done] = await ctx.db
    .select({ id: reportScheduleDeliveries.id })
    .from(reportScheduleDeliveries)
    .where(
      and(
        eq(reportScheduleDeliveries.scheduleId, row.id),
        eq(reportScheduleDeliveries.userId, userId),
        eq(reportScheduleDeliveries.periodFrom, range.from),
        eq(reportScheduleDeliveries.periodTo, range.to),
      ),
    )
  return done !== undefined
}

async function attachmentsFor(
  ctx: SendContext,
  row: ScheduleRow,
  userId: string,
  range: ReportRange,
): Promise<Result<{ attachments: MailAttachment[]; incomplete?: string }, Outcome>> {
  const actor = await loadActor(ctx.root, userId, ctx.signal)
  if (actor === null) return err('skipped_no_access')
  const built = await buildReportExport(ctx.root, actor, { report: row.report, range }, ctx.signal)
  if (!built.ok) {
    if (built.error === 'forbidden') return err('skipped_no_access')
    if (built.error === 'range') return err('failed')
    return ok({ attachments: [], incomplete: built.error.incomplete })
  }
  const files = await Promise.all([exportFile('csv', built.value), exportFile('xlsx', built.value)])
  return ok({ attachments: files })
}

async function deliverTo(
  ctx: SendContext,
  row: ScheduleRow,
  recipient: Recipient,
  range: ReportRange,
): Promise<Outcome | null> {
  if (await alreadyDone(ctx, row, recipient.userId, range)) return null
  const prepared = await attachmentsFor(ctx, row, recipient.userId, range)
  let outcome: Outcome = prepared.ok ? 'failed' : prepared.error
  if (prepared.ok) {
    const message = scheduledReportMail({
      to: recipient.email,
      report: row.report,
      frequency: row.frequency,
      range,
      ...prepared.value,
    })
    outcome = (await ctx.mail.send(message, ctx.signal)).ok ? 'sent' : 'failed'
  }
  if (outcome !== 'failed') {
    await ctx.db
      .insert(reportScheduleDeliveries)
      .values({ scheduleId: row.id, userId: recipient.userId, ...periodColumns(range), outcome })
      .onConflictDoNothing()
  }
  return outcome
}

const periodColumns = (range: ReportRange) => ({ periodFrom: range.from, periodTo: range.to })

async function recipientsOf(ctx: SendContext, scheduleId: string): Promise<Recipient[]> {
  return await ctx.db
    .select({ userId: users.id, email: users.email })
    .from(reportScheduleRecipients)
    .innerJoin(users, eq(users.id, reportScheduleRecipients.userId))
    .where(eq(reportScheduleRecipients.scheduleId, scheduleId))
    .orderBy(asc(users.id))
}

async function runSchedule(ctx: SendContext, row: ScheduleRow, today: CivilDate) {
  const range = periodBefore(row.frequency, row.nextRunOn as CivilDate)
  let sent = 0
  let failed = false
  for (const recipient of await recipientsOf(ctx, row.id)) {
    ctx.signal.throwIfAborted()
    const outcome = await deliverTo(ctx, row, recipient, range)
    if (outcome === 'sent') sent += 1
    if (outcome === 'failed') failed = true
  }
  if (!failed) {
    await ctx.db
      .update(reportSchedules)
      .set({
        nextRunOn: nextRunAfterSend(row.frequency, today),
        lastPeriodFrom: range.from,
        lastPeriodTo: range.to,
        ...(sent > 0 ? { lastSentAt: ctx.now } : {}),
      })
      .where(eq(reportSchedules.id, row.id))
  }
  return { sent, failed }
}

export async function sendDueReports(ctx: SendContext): Promise<Result<{ sent: number }, string>> {
  const today = await townToday(ctx.db, ctx.now, ctx.signal)
  const due = await ctx.db
    .select()
    .from(reportSchedules)
    .where(and(eq(reportSchedules.paused, false), lte(reportSchedules.nextRunOn, today)))
    .orderBy(asc(reportSchedules.nextRunOn), asc(reportSchedules.id))
  let sent = 0
  const failures: string[] = []
  for (const row of due) {
    const result = await runSchedule(ctx, row, today)
    sent += result.sent
    if (result.failed) failures.push(row.id)
  }
  if (failures.length > 0) return err(`scheduled reports not fully sent: ${failures.join(', ')}`)
  return ok({ sent })
}
