import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jobRuns, reportSchedules } from '@/db/schema'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { MailTransport } from '@/features/mail/transport'
import { createSchedule } from '@/features/reports/schedules'
import { runJob } from '@/jobs/defineJob'
import { makeReportsScheduledJob } from '@/jobs/reportsScheduled'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { err } from '@/types/result'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('scheduled reports job', () => {
  it('runs hourly, sends what is due once per hour, and keeps the delivery record on a failure', async () => {
    const made = await createSchedule(
      handle.db,
      world.staff,
      {
        report: 'permit-volume',
        frequency: 'weekly',
        recipientIds: [world.staff.userId, world.admin.userId],
        now: new Date('2026-11-04T15:00:00Z'),
      },
      signal,
    )
    if (!made.ok) throw new Error('create failed')
    const sent = createMemoryTransport()
    let calls = 0
    const halfBroken: MailTransport = {
      send: (message, s) => {
        calls += 1
        return calls === 1 ? sent.send(message, s) : Promise.resolve(err('send_failed'))
      },
    }
    const monday = new Date('2026-11-09T14:00:00Z')
    const job = makeReportsScheduledJob({ mail: halfBroken, now: () => monday })
    expect(job.intervalSeconds).toBe(3600)
    expect(job.dedupKey({})).toBe('reports.scheduled:2026-11-09T14')
    const first = await runJob(handle.db, job, {}, signal)
    expect(first.ok).toBe(false)
    expect(sent.sent).toHaveLength(1)
    const [run] = await handle.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobName, 'reports.scheduled'))
    expect(run?.lastError).toMatch(/not fully sent/)
    const healthy = createMemoryTransport()
    const later = new Date('2026-11-09T15:00:00Z')
    const retry = await runJob(
      handle.db,
      makeReportsScheduledJob({ mail: healthy, now: () => later }),
      {},
      signal,
    )
    expect(retry.ok).toBe(true)
    expect(healthy.sent).toHaveLength(1)
    expect(healthy.sent[0]?.to).not.toBe(sent.sent[0]?.to)
    const [row] = await handle.db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.id, made.value.id))
    expect(row?.nextRunOn).toBe('2026-11-16')
  })

  it('keeps the record of a mail already sent when a later send throws, so the retry skips it', async () => {
    await handle.db.update(reportSchedules).set({ paused: true })
    const made = await createSchedule(
      handle.db,
      world.staff,
      {
        report: 'processing-time',
        frequency: 'monthly',
        recipientIds: [world.staff.userId, world.admin.userId],
        now: new Date('2026-12-04T15:00:00Z'),
      },
      signal,
    )
    if (!made.ok) throw new Error('create failed')
    const sent = createMemoryTransport()
    let calls = 0
    const throwsSecond: MailTransport = {
      send: (message, s) => {
        calls += 1
        if (calls === 1) return sent.send(message, s)
        throw new Error('smtp connection reset')
      },
    }
    const january = new Date('2027-01-01T14:00:00Z')
    const first = await runJob(
      handle.db,
      makeReportsScheduledJob({ mail: throwsSecond, now: () => january }),
      {},
      signal,
    )
    expect(first.ok).toBe(false)
    expect(sent.sent).toHaveLength(1)
    const healthy = createMemoryTransport()
    const later = new Date('2027-01-01T15:00:00Z')
    await runJob(
      handle.db,
      makeReportsScheduledJob({ mail: healthy, now: () => later }),
      {},
      signal,
    )
    const processing = healthy.sent.filter((m) => m.subject.startsWith('Processing time'))
    expect(processing).toHaveLength(1)
    expect(processing[0]?.to).not.toBe(sent.sent[0]?.to)
  })
})
