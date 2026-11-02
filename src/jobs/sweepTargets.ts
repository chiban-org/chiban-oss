import { and, eq, lt, sql } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Db } from '@/db/client'
import {
  exportsTable,
  jobRuns,
  notificationOutbox,
  preservationRecords,
  redactionJobs,
} from '@/db/schema'
import { overdueCalendarPushes } from '@/features/calendar/queuePush'
import { getTownSettings } from '@/features/town/settings'
import { todayInTimeZone } from '@/types/civilDate'
import { calendarPushJob } from './calendarPush'
import { clocksDailyJob } from './clocksDaily'
import type { JobDefinition } from './defineJob'
import { exportsBuildJob } from './exportsBuild'
import { notificationsSendJob } from './notificationsSend'
import { recordsPreserveJob } from './recordsPreserve'
import { redactionRunJob } from './redactionRun'
import { renditionsDeriveJob } from './renditionsDerive'

export interface SweepItem {
  job: JobDefinition<object>
  payload: object
}

export interface SweepTarget {
  name: string
  findOverdue(db: Db, now: Date, signal: AbortSignal): Promise<SweepItem[]>
}

const MS_PER_MINUTE = 60_000
const CLOCKS_FIRST_HOUR = 1
const NOTIFICATION_OVERDUE_MINUTES = 10
const PRESERVATION_OVERDUE_MINUTES = 60
const EXPORT_OVERDUE_MINUTES = 2
const FALLBACK_TIME_ZONE = 'UTC'

function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * MS_PER_MINUTE)
}

function hourInTimeZone(zone: string, now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).format(
      now,
    ),
  )
}

const clocksDailyTarget: SweepTarget = {
  name: JOB_NAMES.CLOCKS_DAILY,
  async findOverdue(db, now, signal) {
    const town = await getTownSettings(db, signal)
    const zone = town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
    if (hourInTimeZone(zone, now) < CLOCKS_FIRST_HOUR) return []
    const today = todayInTimeZone(zone, now)
    const [run] = await db.select().from(jobRuns).where(eq(jobRuns.jobName, JOB_NAMES.CLOCKS_DAILY))
    const lastSuccess = run?.lastSuccessAt ?? null
    if (lastSuccess !== null && todayInTimeZone(zone, lastSuccess) === today) return []
    return [{ job: clocksDailyJob, payload: { today } }]
  },
}

const notificationsTarget: SweepTarget = {
  name: JOB_NAMES.NOTIFICATIONS_SEND,
  async findOverdue(db, now) {
    const [stuck] = await db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.status, 'queued'),
          lt(notificationOutbox.createdAt, minutesBefore(now, NOTIFICATION_OVERDUE_MINUTES)),
        ),
      )
      .limit(1)
    return stuck === undefined
      ? []
      : [{ job: notificationsSendJob, payload: { at: now.toISOString() } }]
  },
}

const calendarTarget: SweepTarget = {
  name: JOB_NAMES.CALENDAR_PUSH,
  async findOverdue(db, now, signal) {
    const overdue = await overdueCalendarPushes(db, now, signal)
    return overdue.map((push) => ({
      job: calendarPushJob,
      payload: { pushId: push.id, attempts: push.attempts },
    }))
  },
}

const preservationTarget: SweepTarget = {
  name: JOB_NAMES.RECORDS_PRESERVE,
  async findOverdue(db, now) {
    const [stuck] = await db
      .select({ id: preservationRecords.id })
      .from(preservationRecords)
      .where(
        and(
          eq(preservationRecords.status, 'pending'),
          lt(preservationRecords.updatedAt, minutesBefore(now, PRESERVATION_OVERDUE_MINUTES)),
        ),
      )
      .limit(1)
    return stuck === undefined
      ? []
      : [{ job: recordsPreserveJob, payload: { at: now.toISOString() } }]
  },
}

const exportsBuildTarget: SweepTarget = {
  name: JOB_NAMES.EXPORTS_BUILD,
  async findOverdue(db, now) {
    const lost = await db
      .select({ id: exportsTable.id })
      .from(exportsTable)
      .where(
        and(
          eq(exportsTable.kind, 'business'),
          eq(exportsTable.status, 'queued'),
          lt(exportsTable.requestedAt, minutesBefore(now, EXPORT_OVERDUE_MINUTES)),
        ),
      )
    return lost.map((row) => ({ job: exportsBuildJob, payload: { exportId: row.id } }))
  },
}

const REDACTION_OVERDUE_MINUTES = 5

const redactionTarget: SweepTarget = {
  name: JOB_NAMES.REDACTION_RUN,
  async findOverdue(db, now) {
    const lost = await db
      .select({ id: redactionJobs.id })
      .from(redactionJobs)
      .where(
        and(
          eq(redactionJobs.status, 'queued'),
          lt(redactionJobs.createdAt, minutesBefore(now, REDACTION_OVERDUE_MINUTES)),
        ),
      )
    return lost.map((row) => ({ job: redactionRunJob, payload: { jobId: row.id } }))
  },
}

const DERIVE_OVERDUE_MINUTES = 30
const DERIVE_BATCH = 25

const renditionsTarget: SweepTarget = {
  name: JOB_NAMES.RENDITIONS_DERIVE,
  async findOverdue(db, now) {
    const rows = await db.execute<{ version_id: string }>(sql`
      select distinct ra.version_id
      from rendition_approvals ra
      join document_versions dv on dv.id = ra.version_id
      left join document_renditions dr on dr.version_id = ra.version_id and dr.kind = 'thumbnail'
      where ra.revoked_at is null
        and ra.approved_at < ${minutesBefore(now, DERIVE_OVERDUE_MINUTES)}
        and dv.content_type in ('application/pdf', 'image/jpeg', 'image/png')
        and dr.version_id is null
      limit ${DERIVE_BATCH}`)
    return rows.rows.map((row) => ({
      job: renditionsDeriveJob,
      payload: { versionId: row.version_id },
    }))
  },
}

const targets: SweepTarget[] = [
  clocksDailyTarget,
  notificationsTarget,
  calendarTarget,
  preservationTarget,
  exportsBuildTarget,
  redactionTarget,
  renditionsTarget,
]

export const SWEEP_TARGETS: readonly SweepTarget[] = targets

export function registerSweepTarget(target: SweepTarget): void {
  if (targets.some((t) => t.name === target.name)) return
  targets.push(target)
}
