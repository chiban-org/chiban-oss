import { eq, sql } from 'drizzle-orm'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Tx } from '@/db/client'
import { auditLog, jobEffects, jobRuns } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { clearBoss, setBoss } from '@/jobs/boss'
import { defineJob, enqueue, runJob } from '@/jobs/defineJob'
import { ensureQueue } from '@/jobs/queues'
import { makeTestDb, type TestDb } from '@/test/db'
import { err, ok, type Result } from '@/types/result'

let handle: TestDb
let boss: PgBoss
const signal = new AbortController().signal

interface Payload {
  id: string
}

const job = defineJob<Payload>({
  name: JOB_NAMES.HEARTBEAT,
  dedupKey: (p) => p.id,
  handler: () => Promise.resolve(ok(undefined)),
})

beforeAll(async () => {
  handle = await makeTestDb()
  boss = new PgBoss(handle.url)
  await boss.start()
  setBoss(boss)
  await ensureQueue(JOB_NAMES.HEARTBEAT)
})
afterAll(async () => {
  clearBoss()
  await boss.stop({ graceful: false })
  await handle.drop()
})
beforeEach(async () => {
  await handle.db.delete(jobRuns)
  await handle.db.delete(jobEffects)
  await handle.db.delete(auditLog)
})

async function queuedCount(): Promise<number> {
  const r = await handle.db.execute<{ n: number }>(
    sql`select count(*)::int as n from pgboss.job where name = ${JOB_NAMES.HEARTBEAT}`,
  )
  return r.rows[0]?.n ?? 0
}

describe('enqueue', () => {
  it('yields one job for the same dedup key and two for different keys', async () => {
    const before = await queuedCount()
    await enqueue(job, { id: 'same' }, signal)
    await enqueue(job, { id: 'same' }, signal)
    expect((await queuedCount()) - before).toBe(1)
    await enqueue(job, { id: 'other' }, signal)
    expect((await queuedCount()) - before).toBe(2)
  })

  it('ensureQueue is idempotent', async () => {
    await ensureQueue(JOB_NAMES.HEARTBEAT)
    await ensureQueue(JOB_NAMES.HEARTBEAT)
  })
})

describe('runJob', () => {
  const failing = defineJob<Payload>({
    name: JOB_NAMES.HEARTBEAT,
    dedupKey: (p) => p.id,
    handler: () => Promise.resolve(err('boom')),
  })

  it('records success time on ok', async () => {
    const result = await runJob(handle.db, job, { id: 'a' }, signal)
    expect(result).toEqual({ ok: true, value: undefined })
    const [row] = await handle.db.select().from(jobRuns).where(eq(jobRuns.jobName, job.name))
    expect(row?.lastSuccessAt).toBeInstanceOf(Date)
    expect(row?.lastFailureAt).toBeNull()
  })

  it('records failure and leaves the last success untouched', async () => {
    await runJob(handle.db, job, { id: 'a' }, signal)
    const [before] = await handle.db.select().from(jobRuns).where(eq(jobRuns.jobName, job.name))
    const result = await runJob(handle.db, failing, { id: 'b' }, signal)
    expect(result).toEqual({ ok: false, error: 'boom' })
    const [after] = await handle.db.select().from(jobRuns).where(eq(jobRuns.jobName, job.name))
    expect(after?.lastFailureAt).toBeInstanceOf(Date)
    expect(after?.lastError).toBe('boom')
    expect(after?.lastSuccessAt?.getTime()).toBe(before?.lastSuccessAt?.getTime())
  })

  it('treats a thrown handler as a recorded failure', async () => {
    const throwing = defineJob<Payload>({
      name: JOB_NAMES.HEARTBEAT,
      dedupKey: (p) => p.id,
      handler: () => Promise.reject(new Error('kaput')),
    })
    const result = await runJob(handle.db, throwing, { id: 'a' }, signal)
    expect(result.ok).toBe(false)
    const [row] = await handle.db.select().from(jobRuns).where(eq(jobRuns.jobName, job.name))
    expect(row?.lastError).toContain('kaput')
  })
})

describe('job effects', () => {
  const effectJob = (handler: (db: Tx) => Promise<Result<void, string>>) =>
    defineJob<Payload>({
      name: JOB_NAMES.HEARTBEAT,
      dedupKey: (p) => p.id,
      handler: async (_payload, ctx) => await handler(ctx.db),
    })

  async function writes(): Promise<number> {
    return (await handle.db.select().from(auditLog)).length
  }

  async function writeOne(db: Tx) {
    await writeAudit(
      db,
      {
        actor: { kind: 'system', job: 'test' },
        action: 'effect',
        entityType: 'job',
        entityId: 'x',
      },
      signal,
    )
  }

  it('same payload enqueued again after completion runs the handler once in total', async () => {
    let calls = 0
    const counting = effectJob(async () => {
      calls += 1
      return ok(undefined)
    })
    expect(await runJob(handle.db, counting, { id: 'once' }, signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await runJob(handle.db, counting, { id: 'once' }, signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(calls).toBe(1)
    await runJob(handle.db, counting, { id: 'other' }, signal)
    expect(calls).toBe(2)
  })

  it('a handler that fails after writing leaves no effect and a retry applies it once', async () => {
    const failing = effectJob(async (db) => {
      await writeOne(db)
      return err('late failure')
    })
    const succeeding = effectJob(async (db) => {
      await writeOne(db)
      return ok(undefined)
    })
    expect(await runJob(handle.db, failing, { id: 'retry' }, signal)).toEqual({
      ok: false,
      error: 'late failure',
    })
    expect(await writes()).toBe(0)
    expect(await handle.db.select().from(jobEffects)).toHaveLength(0)
    await runJob(handle.db, succeeding, { id: 'retry' }, signal)
    await runJob(handle.db, succeeding, { id: 'retry' }, signal)
    expect(await writes()).toBe(1)
  })

  it('a handler that throws after writing leaves no effect', async () => {
    const throwing = effectJob(async (db) => {
      await writeOne(db)
      throw new Error('kaput')
    })
    const result = await runJob(handle.db, throwing, { id: 'throws' }, signal)
    expect(result.ok).toBe(false)
    expect(await writes()).toBe(0)
    expect(await handle.db.select().from(jobEffects)).toHaveLength(0)
  })

  it('records the failure in job_runs even though the effect rolled back', async () => {
    const failing = effectJob(async () => err('nope'))
    await runJob(handle.db, failing, { id: 'recorded' }, signal)
    const [row] = await handle.db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.jobName, JOB_NAMES.HEARTBEAT))
    expect(row?.lastError).toBe('nope')
  })
})
