import { sql } from 'drizzle-orm'
import { date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const boardMeetings = pgTable(
  'board_meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    board: text('board', { enum: ['planning_board', 'zba'] }).notNull(),
    meetingDate: date('meeting_date', { mode: 'string' }).notNull(),
    kind: text('kind', { enum: ['regular', 'special'] }).notNull(),
    status: text('status', { enum: ['scheduled', 'cancelled'] })
      .notNull()
      .default('scheduled'),
    location: text('location').notNull().default(''),
    startsAtMinute: integer('starts_at_minute').notNull().default(1140),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('board_meetings_scheduled_idx')
      .on(t.board, t.meetingDate, t.kind)
      .where(sql`${t.status} = 'scheduled'`),
  ],
)
