import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const simulatedProcessorObjects = pgTable('simulated_processor_objects', {
  id: text('id').primaryKey(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status', {
    enum: ['pending', 'authorized', 'captured', 'declined', 'canceled'],
  })
    .notNull()
    .default('pending'),
  settled: boolean('settled').notNull().default(false),
  refunds: jsonb('refunds').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
