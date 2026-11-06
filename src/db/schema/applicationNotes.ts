import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const applicationNotes = pgTable(
  'application_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    body: text('body').notNull(),
    authorId: uuid('author_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('application_notes_application_idx').on(t.applicationId, t.createdAt)],
)
