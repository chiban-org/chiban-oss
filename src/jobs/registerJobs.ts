import type { PgBoss } from 'pg-boss'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { clocksDailyJob } from './clocksDaily'
import { cronForInterval } from './cron'
import { type JobDefinition, runJob } from './defineJob'
import { expireAliasOverridesJob } from './expireAliasOverrides'
import { gisRefreshLayerJob, gisScheduleRefreshesJob } from './gisRefreshLayer'
import { heartbeatJob } from './heartbeat'
import { paymentsReconcileJob } from './paymentsReconcile'

export async function registerJob<P extends object>(
  boss: PgBoss,
  db: Db,
  job: JobDefinition<P>,
): Promise<void> {
  const existing = await boss.getQueue(job.name)
  if (existing === null) await boss.createQueue(job.name, { policy: 'exclusive' })
  await boss.work<P>(job.name, async (batch) => {
    for (const item of batch) {
      const outcome = await runJob(db, job, item.data, AbortSignal.timeout(10 * 60 * 1000))
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
  await registerJob(boss, db, heartbeatJob)
  await registerJob(boss, db, gisRefreshLayerJob)
  await registerJob(boss, db, gisScheduleRefreshesJob)
  await registerJob(boss, db, expireAliasOverridesJob)
  await registerJob(boss, db, clocksDailyJob)
  await registerJob(boss, db, paymentsReconcileJob)
}
