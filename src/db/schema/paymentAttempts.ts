import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { processorAccounts } from './processorAccounts'

export const PAYMENT_ATTEMPT_STATES = [
  'pending',
  'authorized',
  'captured',
  'settled',
  'declined',
  'voided',
] as const
export type AttemptState = (typeof PAYMENT_ATTEMPT_STATES)[number]

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    processorAccountId: uuid('processor_account_id')
      .notNull()
      .references(() => processorAccounts.id),
    channel: text('channel', { enum: ['card_online', 'card_present'] }).notNull(),
    state: text('state', { enum: PAYMENT_ATTEMPT_STATES }).notNull().default('pending'),
    outcomeUnknown: boolean('outcome_unknown').notNull().default(false),
    baseCents: integer('base_cents').notNull(),
    convenienceFeeCents: integer('convenience_fee_cents').notNull(),
    amountCents: integer('amount_cents').notNull(),
    plannedAllocations: jsonb('planned_allocations').notNull(),
    payerName: text('payer_name').notNull(),
    payerEmail: text('payer_email'),
    payerUserId: uuid('payer_user_id'),
    checkoutRef: text('checkout_ref'),
    processorObjectId: text('processor_object_id'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    anomaly: text('anomaly'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    rowVersion: integer('row_version').notNull().default(1),
  },
  (t) => [
    index('payment_attempts_state_idx').on(t.state),
    index('payment_attempts_object_idx').on(t.processorAccountId, t.processorObjectId),
    index('payment_attempts_checkout_idx').on(t.processorAccountId, t.checkoutRef),
  ],
)

export const paymentAttemptTransitions = pgTable(
  'payment_attempt_transitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => paymentAttempts.id),
    fromState: text('from_state', { enum: PAYMENT_ATTEMPT_STATES }).notNull(),
    toState: text('to_state', { enum: PAYMENT_ATTEMPT_STATES }).notNull(),
    source: text('source', { enum: ['event', 'reconcile', 'staff', 'reader'] }).notNull(),
    eventId: text('event_id'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payment_attempt_transitions_attempt_idx').on(t.attemptId)],
)

export type PaymentAttemptRow = typeof paymentAttempts.$inferSelect
