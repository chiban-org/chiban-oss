import type { JobName } from '@/constants/jobNames'

export interface ScheduledJob {
  name: JobName
  intervalSeconds?: number
  staleAfterSeconds?: number
}

export async function allScheduledJobs(): Promise<ScheduledJob[]> {
  const { ALL_JOBS } = await import('@/jobs/allJobs')
  return ALL_JOBS
}
