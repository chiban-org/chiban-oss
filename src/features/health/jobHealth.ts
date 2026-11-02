import type { JobName } from '@/constants/jobNames'
import type { DbOrTx } from '@/db/client'
import { jobRuns, workerState } from '@/db/schema'
import { allScheduledJobs, type ScheduledJob } from './scheduledJobs'

export interface JobHealthRow {
  name: JobName
  intervalSeconds: number | null
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  stale: boolean
}

const STALE_AFTER_INTERVALS = 2
const MS_PER_SECOND = 1000

export async function jobHealth(
  db: DbOrTx,
  now: Date,
  signal: AbortSignal,
  jobs?: ScheduledJob[],
): Promise<JobHealthRow[]> {
  signal.throwIfAborted()
  const list = jobs ?? (await allScheduledJobs())
  const [runs, [worker]] = await Promise.all([
    db.select().from(jobRuns),
    db.select().from(workerState).limit(1),
  ])
  const byName = new Map(runs.map((r) => [r.jobName, r]))
  return list.map((job) => {
    const run = byName.get(job.name)
    const lastSuccessAt = run?.lastSuccessAt ?? null
    const interval = job.intervalSeconds ?? null
    const limitMs = interval === null ? null : interval * STALE_AFTER_INTERVALS * MS_PER_SECOND
    const reference = lastSuccessAt ?? worker?.startedAt ?? null
    const stale =
      limitMs !== null && reference !== null && now.getTime() - reference.getTime() > limitMs
    return {
      name: job.name,
      intervalSeconds: interval,
      lastSuccessAt,
      lastFailureAt: run?.lastFailureAt ?? null,
      stale,
    }
  })
}
