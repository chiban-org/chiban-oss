import { pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

export const jobRuns = pgTable('job_runs', {
  jobName: text('job_name').primaryKey(),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  lastError: text('last_error'),
})

export const jobEffects = pgTable(
  'job_effects',
  {
    jobName: text('job_name').notNull(),
    dedupKey: text('dedup_key').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.jobName, t.dedupKey] })],
)
