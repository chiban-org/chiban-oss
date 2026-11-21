import { date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { boardDecisions } from './decisions'
import { documents } from './documents'

export const decisionRecordings = pgTable('decision_recordings', {
  decisionId: uuid('decision_id')
    .primaryKey()
    .references(() => boardDecisions.id),
  registry: text('registry').notNull(),
  book: text('book').notNull(),
  page: text('page').notNull(),
  recordedOn: date('recorded_on', { mode: 'string' }).notNull(),
  certificateDocumentId: uuid('certificate_document_id')
    .notNull()
    .references(() => documents.id),
  recordedBy: uuid('recorded_by').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
})
