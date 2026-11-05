import { date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { boardMeetings } from './boards'
import { documents } from './documents'

export const meetingMinutes = pgTable('meeting_minutes', {
  meetingId: uuid('meeting_id')
    .primaryKey()
    .references(() => boardMeetings.id),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id),
  status: text('status', { enum: ['draft', 'approved'] }).notNull(),
  approvedOn: date('approved_on', { mode: 'string' }),
  recordedBy: uuid('recorded_by').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
})
