import { sql } from 'drizzle-orm'
import { PgBoss } from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import { backupsScheduledJob } from '@/jobs/backupsScheduled'
import { clearBoss, setBoss } from '@/jobs/boss'
import { enqueue } from '@/jobs/defineJob'
import { registerJob } from '@/jobs/registerJobs'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let boss: PgBoss

beforeAll(async () => {
  handle = await makeTestDb()
  boss = new PgBoss(handle.url)
  await boss.start()
  setBoss(boss)
})
afterAll(async () => {
  clearBoss()
  await boss.stop({ graceful: false })
  await handle.drop()
})

describe('backups.scheduled queue', () => {
  it('pg-boss accepts the six hour limit, no retries and a heartbeat, and jobs carry them', async () => {
    await registerJob(boss, handle.db, backupsScheduledJob)
    await boss.offWork(JOB_NAMES.BACKUPS_SCHEDULED)
    const id = await enqueue(backupsScheduledJob, { at: '2027-03-01T06:00:00.000Z' }, signal)
    expect(id).not.toBeNull()
    const rows = await handle.db.execute<{
      retry_limit: number
      expire_seconds: number
      heartbeat_seconds: number
    }>(sql`select retry_limit, expire_seconds, heartbeat_seconds from pgboss.job where id = ${id}`)
    expect(rows.rows[0]).toEqual({
      retry_limit: 0,
      expire_seconds: 6 * 60 * 60,
      heartbeat_seconds: 120,
    })
    expect((await boss.getSchedules()).map((s) => s.name)).toContain(JOB_NAMES.BACKUPS_SCHEDULED)
  })
})
