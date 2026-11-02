import { sql } from 'drizzle-orm'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import { exportsTable } from '@/db/schema'
import { clearBoss, setBoss } from '@/jobs/boss'
import { runJob } from '@/jobs/defineJob'
import { exportsPickupJob } from '@/jobs/exportsBuild'
import { ensureQueue } from '@/jobs/queues'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let boss: PgBoss

beforeAll(async () => {
  handle = await makeTestDb()
  boss = new PgBoss(handle.url)
  await boss.start()
  setBoss(boss)
  await ensureQueue(JOB_NAMES.EXPORTS_BUILD)
})
afterAll(async () => {
  clearBoss()
  await boss.stop({ graceful: false })
  await handle.drop()
})

async function queued(): Promise<number> {
  const r = await handle.db.execute<{ n: number }>(
    sql`select count(*)::int as n from pgboss.job where name = ${JOB_NAMES.EXPORTS_BUILD}`,
  )
  return r.rows[0]?.n ?? 0
}

describe('exports.pickup', () => {
  it('enqueues a build for each queued export once, even when it runs twice', async () => {
    await handle.db.insert(exportsTable).values([
      { kind: 'business', status: 'queued' },
      { kind: 'business', status: 'ready' },
    ])
    await runJob(handle.db, exportsPickupJob, { at: '2027-01-01T00:00:00Z' }, signal)
    await runJob(handle.db, exportsPickupJob, { at: '2027-01-01T00:01:00Z' }, signal)
    expect(await queued()).toBe(1)
  })
})
