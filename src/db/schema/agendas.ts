import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { boardMeetings } from './boards'
import { hearings } from './hearings'

export const agendas = pgTable('agendas', {
  meetingId: uuid('meeting_id')
    .primaryKey()
    .references(() => boardMeetings.id),
  status: text('status', { enum: ['draft', 'published'] })
    .notNull()
    .default('draft'),
  revision: integer('revision').notNull().default(0),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  documentId: uuid('document_id'),
})

export const agendaItems = pgTable(
  'agenda_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => agendas.meetingId),
    position: integer('position').notNull(),
    kind: text('kind', { enum: ['hearing', 'business', 'minutes_approval', 'other'] }).notNull(),
    hearingId: uuid('hearing_id').references(() => hearings.id),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
  },
  (t) => [index('agenda_items_meeting_idx').on(t.meetingId, t.position)],
)
