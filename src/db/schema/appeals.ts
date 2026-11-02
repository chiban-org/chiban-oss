import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const appeals = pgTable(
  'appeals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    kind: text('kind', { enum: ['appeal_of_issuance'] }).notNull(),
    filedOn: date('filed_on', { mode: 'string' }).notNull(),
    appellantName: text('appellant_name').notNull(),
    resolvedOn: date('resolved_on', { mode: 'string' }),
    outcome: text('outcome', { enum: ['permit_upheld', 'permit_revoked'] }),
    recordedBy: uuid('recorded_by').notNull(),
    resolvedBy: uuid('resolved_by'),
  },
  (t) => [index('appeals_application_idx').on(t.applicationId)],
)
