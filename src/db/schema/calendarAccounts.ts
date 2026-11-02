import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const calendarAccounts = pgTable('calendar_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['graph'] }).notNull(),
  tenantId: text('tenant_id').notNull(),
  clientId: text('client_id').notNull(),
  clientSecretEnc: text('client_secret_enc').notNull(),
  authorityBase: text('authority_base').notNull().default('https://login.microsoftonline.com'),
  graphBase: text('graph_base').notNull().default('https://graph.microsoft.com'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type CalendarAccountRow = typeof calendarAccounts.$inferSelect
