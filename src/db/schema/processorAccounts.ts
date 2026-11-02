import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { PROCESSORS } from '@/features/ledger/types'

export const processorAccounts = pgTable(
  'processor_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    processor: text('processor', { enum: PROCESSORS }).notNull(),
    mode: text('mode', { enum: ['test', 'live'] }).notNull(),
    accountRef: text('account_ref').notNull(),
    settings: jsonb('settings').notNull().default({}),
    credentialsEnc: text('credentials_enc').notNull(),
    webhookSecretEnc: text('webhook_secret_enc').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('processor_accounts_one_active').on(t.isActive).where(sql`${t.isActive}`)],
)

export type ProcessorAccountRow = typeof processorAccounts.$inferSelect
