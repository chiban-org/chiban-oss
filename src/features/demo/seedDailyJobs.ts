import type { Db } from '@/db/client'
import { must } from '@/features/demo/seedPermitSupport'
import { appealsDailyJob } from '@/jobs/appealsDaily'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import type { CivilDate } from '@/types/civilDate'

export async function runDailyJobsAsOf(
  db: Db,
  today: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  must(await runJob(db, appealsDailyJob, { today }, signal), 'appeals daily job')
  must(await runJob(db, clocksDailyJob, { today }, signal), 'clocks daily job')
}
