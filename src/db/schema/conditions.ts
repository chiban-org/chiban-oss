import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const applicationConditions = pgTable(
  'application_conditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    code: text('code').notNull(),
    textSnapshot: text('text_snapshot').notNull(),
    blocksIssuance: boolean('blocks_issuance').notNull(),
    status: text('status', { enum: ['unmet', 'met', 'waived'] })
      .notNull()
      .default('unmet'),
    statusReason: text('status_reason'),
    changedBy: uuid('changed_by').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('application_conditions_application_idx').on(t.applicationId)],
)
