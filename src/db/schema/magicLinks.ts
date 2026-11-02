import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './identity'

export const magicLinks = pgTable(
  'magic_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('magic_links_user_idx').on(t.userId)],
)
