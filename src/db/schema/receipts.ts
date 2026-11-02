import { boolean, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { citext } from './identity'

export const receipts = pgTable('receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  number: text('number').notNull().unique(),
  kind: text('kind', { enum: ['payment', 'refund'] }).notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
  businessDate: date('business_date', { mode: 'string' }).notNull(),
  payerName: text('payer_name').notNull(),
  payerEmail: citext('payer_email'),
  totalCents: integer('total_cents').notNull(),
  tenderedCents: integer('tendered_cents'),
  changeCents: integer('change_cents'),
  simulated: boolean('simulated').notNull().default(false),
})

export const receiptNumberCounters = pgTable('receipt_number_counters', {
  year: integer('year').primaryKey(),
  last: integer('last').notNull(),
})

export type ReceiptRow = typeof receipts.$inferSelect
