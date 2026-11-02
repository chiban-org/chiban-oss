import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const jobRuns = pgTable('job_runs', {
  jobName: text('job_name').primaryKey(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  lastError: text('last_error'),
})
