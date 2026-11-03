import type { JobHealthRow } from '@/features/health/jobHealth'

export function jobNeedsAttention(job: JobHealthRow): boolean {
  if (job.stale) return true
  if (job.lastFailureAt === null) return false
  return job.lastSuccessAt === null || job.lastFailureAt > job.lastSuccessAt
}

export function splitJobs(jobs: readonly JobHealthRow[]): {
  attention: JobHealthRow[]
  rest: JobHealthRow[]
} {
  return {
    attention: jobs.filter(jobNeedsAttention),
    rest: jobs.filter((job) => !jobNeedsAttention(job)),
  }
}
