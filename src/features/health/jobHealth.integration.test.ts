import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { JOB_NAMES } from '@/constants/jobNames'
import { jobRuns, workerState } from '@/db/schema'
import { diskUsage } from '@/features/health/disk'
import { jobHealth } from '@/features/health/jobHealth'
import { recordWorkerStart } from '@/features/health/workerState'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const NOW = new Date('2026-11-02T12:00:00Z')
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000)
const jobs = [{ name: JOB_NAMES.HEARTBEAT, intervalSeconds: 300 }]
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(async () => {
  await handle.db.delete(jobRuns)
  await handle.db.delete(workerState)
})

describe('jobHealth', () => {
  it('a 300-second job last successful 11 minutes ago is stale; 9 minutes ago is not', async () => {
    await recordWorkerStart(handle.db, minutesAgo(600), signal)
    await handle.db
      .insert(jobRuns)
      .values({ jobName: JOB_NAMES.HEARTBEAT, lastSuccessAt: minutesAgo(11) })
    expect((await jobHealth(handle.db, NOW, signal, jobs))[0]?.stale).toBe(true)
    await handle.db.delete(jobRuns)
    await handle.db
      .insert(jobRuns)
      .values({ jobName: JOB_NAMES.HEARTBEAT, lastSuccessAt: minutesAgo(9) })
    expect((await jobHealth(handle.db, NOW, signal, jobs))[0]?.stale).toBe(false)
  })

  it('a never-run job is stale only after the worker has been up twice its interval', async () => {
    await recordWorkerStart(handle.db, minutesAgo(9), signal)
    expect((await jobHealth(handle.db, NOW, signal, jobs))[0]).toMatchObject({
      lastSuccessAt: null,
      stale: false,
    })
    await recordWorkerStart(handle.db, minutesAgo(11), signal)
    expect((await jobHealth(handle.db, NOW, signal, jobs))[0]?.stale).toBe(true)
  })

  it('a never-run job is not stale when no worker has ever started', async () => {
    expect((await jobHealth(handle.db, NOW, signal, jobs))[0]?.stale).toBe(false)
  })

  it('a job with its own stale limit is judged by that limit, not twice its interval', async () => {
    await recordWorkerStart(handle.db, minutesAgo(600), signal)
    await handle.db
      .insert(jobRuns)
      .values({ jobName: JOB_NAMES.BACKUPS_SCHEDULED, lastSuccessAt: minutesAgo(300) })
    const long = [
      { name: JOB_NAMES.BACKUPS_SCHEDULED, intervalSeconds: 3600, staleAfterSeconds: 8 * 3600 },
    ]
    expect((await jobHealth(handle.db, NOW, signal, long))[0]?.stale).toBe(false)
    const after = [{ ...long[0], staleAfterSeconds: 4 * 3600 }] as typeof long
    expect((await jobHealth(handle.db, NOW, signal, after))[0]?.stale).toBe(true)
  })

  it('a job without an interval is never stale and reports a null interval', async () => {
    const rows = await jobHealth(handle.db, NOW, signal, [{ name: JOB_NAMES.EXPORTS_BUILD }])
    expect(rows[0]).toMatchObject({ intervalSeconds: null, stale: false })
  })

  it('recordWorkerStart keeps a single row and moves started_at', async () => {
    await recordWorkerStart(handle.db, minutesAgo(30), signal)
    await recordWorkerStart(handle.db, minutesAgo(5), signal)
    const rows = await handle.db.select().from(workerState)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.startedAt.getTime()).toBe(minutesAgo(5).getTime())
  })
})

describe('diskUsage', () => {
  it('reports a used ratio between 0 and 1 for a real path', async () => {
    const [reading] = await diskUsage(['/'], signal)
    expect(reading?.path).toBe('/')
    expect(reading?.usedRatio).toBeGreaterThan(0)
    expect(reading?.usedRatio).toBeLessThanOrEqual(1)
  })
})
