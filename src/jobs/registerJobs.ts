import type { PgBoss } from 'pg-boss'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { ALL_JOBS } from './allJobs'
import { cronForInterval } from './cron'
import { type JobDefinition, runJob } from './defineJob'

export async function registerJob<P extends object>(
  boss: PgBoss,
  db: Db,
  job: JobDefinition<P>,
): Promise<void> {
  const existing = await boss.getQueue(job.name)
  if (existing === null) await boss.createQueue(job.name, { policy: 'exclusive' })
  await boss.work<P>(job.name, async (batch) => {
    for (const item of batch) {
      const outcome = await runJob(
        db,
        job,
        (item.data as P | null) ?? ({} as P),
        AbortSignal.timeout(10 * 60 * 1000),
      )
      if (!outcome.ok) {
        throw new AppError(ErrorIds.JOB_HANDLER_FAIL, outcome.error, { job: job.name })
      }
    }
  })
  if (job.intervalSeconds !== undefined) {
    await boss.schedule(job.name, cronForInterval(job.intervalSeconds))
  }
}

export async function registerAllJobs(boss: PgBoss, db: Db): Promise<void> {
  for (const job of ALL_JOBS) await registerJob(boss, db, job)
}
