import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { boards } from './boards'

export const boardMemberships = pgTable(
  'board_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id),
    title: text('title', {
      enum: ['chair', 'vice_chair', 'member', 'alternate', 'clerk'],
    }).notNull(),
    termStart: date('term_start', { mode: 'string' }).notNull(),
    termEnd: date('term_end', { mode: 'string' }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('board_memberships_user_idx').on(t.userId)],
)
