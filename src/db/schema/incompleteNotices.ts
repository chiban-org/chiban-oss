import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { applications } from './projects'

export const incompleteNotices = pgTable(
  'incomplete_notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    sentOn: date('sent_on', { mode: 'string' }).notNull(),
    reason: text('reason').notNull(),
    documentId: uuid('document_id').references(() => documents.id),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('incomplete_notices_application_idx').on(t.applicationId)],
)
