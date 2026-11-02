import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const ruleTransitionsApplied = pgTable('rule_transitions_applied', {
  id: text('id').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
  appliedBy: text('applied_by').notNull(),
  affected: integer('affected').notNull(),
})

export const remediationTasks = pgTable(
  'remediation_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    kind: text('kind').notNull(),
    description: text('description').notNull(),
    status: text('status', { enum: ['open', 'done'] })
      .notNull()
      .default('open'),
    transitionId: text('transition_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('remediation_tasks_application_idx').on(t.applicationId)],
)
