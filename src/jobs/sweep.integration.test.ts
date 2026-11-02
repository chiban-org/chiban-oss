import { eq, sql } from 'drizzle-orm'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { JOB_NAMES, type JobName } from '@/constants/jobNames'
import {
  calendarPushes,
  exportsTable,
  jobEffects,
  jobRuns,
  notificationOutbox,
  preservationRecords,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { queueCalendarPush } from '@/features/calendar/queuePush'
import { clearBoss, setBoss } from '@/jobs/boss'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import { ensureQueue } from '@/jobs/queues'
import { runSweep } from '@/jobs/sweep'
import { SWEEP_TARGETS, type SweepTarget } from '@/jobs/sweepTargets'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import {
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { makeTestStore } from '@/test/minio'
import { ok } from '@/types/result'

const signal = new AbortController().signal
const BEFORE_ONE_AM = new Date('2026-11-02T05:30:00Z')
const AFTER_ONE_AM = new Date('2026-11-02T06:30:00Z')
const NOW = new Date('2026-11-02T15:00:00Z')
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000)
const SWEPT: JobName[] = [
  JOB_NAMES.CLOCKS_DAILY,
  JOB_NAMES.NOTIFICATIONS_SEND,
  JOB_NAMES.CALENDAR_PUSH,
  JOB_NAMES.RECORDS_PRESERVE,
  JOB_NAMES.EXPORTS_BUILD,
]
let handle: TestDb
let boss: PgBoss
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  boss = new PgBoss(handle.url)
  await boss.start()
  setBoss(boss)
  for (const name of SWEPT) await ensureQueue(name)
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  clearBoss()
  await boss.stop({ graceful: false })
  await handle.drop()
})
beforeEach(async () => {
  await handle.db.execute(sql`delete from pgboss.job`)
  await handle.db.delete(jobRuns)
  await handle.db.delete(jobEffects)
  await handle.db.delete(notificationOutbox)
  await handle.db.delete(calendarPushes)
  await handle.db.delete(exportsTable)
})

async function queued(name: JobName): Promise<number> {
  const r = await handle.db.execute<{ n: number }>(
    sql`select count(*)::int as n from pgboss.job where name = ${name}`,
  )
  return r.rows[0]?.n ?? 0
}

async function outbox(createdAt: Date, discriminator: string): Promise<void> {
  await handle.db.insert(notificationOutbox).values({
    event: 'application_submitted',
    applicationId: w.trade.applicationId,
    recipientUserId: w.inspector.userId,
    payload: { discriminator },
    createdAt,
  })
}

let slotDay = 10

async function queuedPush(createdAt: Date): Promise<string> {
  slotDay += 1
  const inspectionId = await insertInspection(handle.db, w.trade.applicationId, 'final', {
    status: 'scheduled',
    inspectorUserId: w.inspector.userId,
    scheduledDate: `2027-11-${slotDay}`,
    startMinute: 570,
    durationMinutes: 60,
  })
  const pushed = await transactionResult(handle.db, async (tx) =>
    ok(
      await queueCalendarPush(
        tx,
        { inspectionId, sequence: 0, op: 'publish', inspectorUserId: w.inspector.userId },
        signal,
      ),
    ),
  )
  if (!pushed.ok || pushed.value === null) throw new Error('queue failed')
  await handle.db
    .update(calendarPushes)
    .set({ createdAt })
    .where(eq(calendarPushes.id, pushed.value))
  return pushed.value
}

describe('jobs.sweep', () => {
  it('a missed clocks.daily for today is re-enqueued after 01:00 town time and not before', async () => {
    await runSweep(handle.db, BEFORE_ONE_AM, signal)
    expect(await queued(JOB_NAMES.CLOCKS_DAILY)).toBe(0)
    await runSweep(handle.db, AFTER_ONE_AM, signal)
    expect(await queued(JOB_NAMES.CLOCKS_DAILY)).toBe(1)
  })

  it('does not re-enqueue clocks.daily when it already succeeded on the town date', async () => {
    await handle.db
      .insert(jobRuns)
      .values({ jobName: JOB_NAMES.CLOCKS_DAILY, lastSuccessAt: new Date('2026-11-02T06:10:00Z') })
    await runSweep(handle.db, AFTER_ONE_AM, signal)
    expect(await queued(JOB_NAMES.CLOCKS_DAILY)).toBe(0)
  })

  it('the daily clock job enqueued twice by the sweeper runs once', async () => {
    const today = { today: civil('2026-11-02') }
    await runJob(handle.db, clocksDailyJob, today, signal)
    await runJob(handle.db, clocksDailyJob, today, signal)
    const effects = await handle.db.select().from(jobEffects)
    expect(effects.map((e) => e.dedupKey)).toEqual(['clocks.daily:2026-11-02'])
  })

  it('a 12-minute-old queued notification is re-enqueued; a 2-minute-old one is not', async () => {
    await outbox(minutesAgo(2), 'fresh')
    await runSweep(handle.db, NOW, signal)
    expect(await queued(JOB_NAMES.NOTIFICATIONS_SEND)).toBe(0)
    await outbox(minutesAgo(12), 'stale')
    await runSweep(handle.db, NOW, signal)
    expect(await queued(JOB_NAMES.NOTIFICATIONS_SEND)).toBe(1)
  })

  it('an overdue calendar push is re-enqueued', async () => {
    await queuedPush(minutesAgo(6))
    await runSweep(handle.db, NOW, signal)
    expect(await queued(JOB_NAMES.CALENDAR_PUSH)).toBe(1)
  })

  it('a pending preservation record older than an hour is re-enqueued', async () => {
    const { store } = await makeTestStore()
    const up = await uploadAs(
      handle.db,
      store,
      w.world.admin,
      { kind: 'application', id: w.trade.applicationId },
      pdfBytes('sweep'),
    )
    await handle.db
      .update(preservationRecords)
      .set({ updatedAt: minutesAgo(30) })
      .where(eq(preservationRecords.originalVersionId, up.versionId))
    await runSweep(handle.db, NOW, signal)
    expect(await queued(JOB_NAMES.RECORDS_PRESERVE)).toBe(0)
    await handle.db
      .update(preservationRecords)
      .set({ updatedAt: minutesAgo(61) })
      .where(eq(preservationRecords.originalVersionId, up.versionId))
    await runSweep(handle.db, NOW, signal)
    expect(await queued(JOB_NAMES.RECORDS_PRESERVE)).toBe(1)
  })

  it('a queued business export older than 2 minutes whose build job was lost is re-enqueued', async () => {
    await handle.db.insert(exportsTable).values([
      { kind: 'business', status: 'queued', requestedAt: minutesAgo(1) },
      { kind: 'business', status: 'ready', requestedAt: minutesAgo(30) },
    ])
    await runSweep(handle.db, NOW, signal)
    expect(await queued(JOB_NAMES.EXPORTS_BUILD)).toBe(0)
    await handle.db
      .insert(exportsTable)
      .values({ kind: 'business', status: 'queued', requestedAt: minutesAgo(3) })
    await runSweep(handle.db, NOW, signal)
    expect(await queued(JOB_NAMES.EXPORTS_BUILD)).toBe(1)
  })

  it('sweeping twice in one window has one effect and reports counts per target', async () => {
    await handle.db.insert(jobRuns).values({ jobName: JOB_NAMES.CLOCKS_DAILY, lastSuccessAt: NOW })
    await outbox(minutesAgo(12), 'stale')
    await queuedPush(minutesAgo(6))
    const first = await runSweep(handle.db, NOW, signal)
    const second = await runSweep(handle.db, NOW, signal)
    expect(await queued(JOB_NAMES.NOTIFICATIONS_SEND)).toBe(1)
    expect(await queued(JOB_NAMES.CALENDAR_PUSH)).toBe(1)
    expect(first.counts['notifications.send']).toBe(1)
    expect(first.counts['calendar.push']).toBe(1)
    expect(first.counts['clocks.daily']).toBe(0)
    expect(second.failures).toEqual([])
  })

  it('a failing target is reported and does not stop the others', async () => {
    await outbox(minutesAgo(12), 'stale')
    const broken: SweepTarget = {
      name: 'broken',
      findOverdue: () => Promise.reject(new Error('boom')),
    }
    const targets = [broken, ...SWEEP_TARGETS]
    const result = await runSweep(handle.db, NOW, signal, targets)
    expect(result.failures).toEqual(['broken: boom'])
    expect(await queued(JOB_NAMES.NOTIFICATIONS_SEND)).toBe(1)
  })

  it('registers the five M6 targets', () => {
    expect(SWEEP_TARGETS.map((t) => t.name).slice(0, 5)).toEqual([
      'clocks.daily',
      'notifications.send',
      'calendar.push',
      'records.preserve',
      'exports.build',
    ])
  })
})
