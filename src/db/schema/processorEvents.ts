import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { processorAccounts } from './processorAccounts'

export const PROCESSOR_EVENT_OUTCOMES = [
  'reconciled',
  'ignored',
  'no_attempt',
  'foreign_object',
  'error',
] as const

export const processorEvents = pgTable(
  'processor_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    processorAccountId: uuid('processor_account_id')
      .notNull()
      .references(() => processorAccounts.id),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    objectId: text('object_id'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    outcome: text('outcome', { enum: PROCESSOR_EVENT_OUTCOMES }),
    raw: jsonb('raw').notNull(),
  },
  (t) => [
    unique('processor_events_account_event_uq').on(t.processorAccountId, t.eventId),
    index('processor_events_unprocessed_idx').on(t.processedAt),
  ],
)
