import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { boardDecisions } from './decisions'
import { documents } from './documents'
import { applications, projectParties } from './projects'

export const NOTIFICATION_EVENTS = [
  'application_submitted',
  'fees_due',
  'payment_received',
  'application_issued',
  'application_denied',
  'review_assigned',
  'board_comment_requested',
  'inspection_scheduled',
  'inspection_cancelled',
  'inspection_result',
  'permit_corrected',
  'clock_due_soon',
  'clock_overdue',
  'decision_filed',
] as const

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    event: text('event', { enum: NOTIFICATION_EVENTS }).notNull(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    recipientUserId: uuid('recipient_user_id'),
    recipientPartyId: uuid('recipient_party_id').references(() => projectParties.id),
    payload: jsonb('payload').notNull().default({}),
    status: text('status', { enum: ['queued', 'sent', 'dropped', 'failed'] })
      .notNull()
      .default('queued'),
    dropReason: text('drop_reason'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('notification_outbox_dedup_idx').on(
      t.event,
      t.applicationId,
      t.recipientUserId,
      sql`coalesce(${t.payload}->>'discriminator', '')`,
    ),
    uniqueIndex('notification_outbox_party_dedup_idx')
      .on(
        t.event,
        t.applicationId,
        t.recipientPartyId,
        sql`coalesce(${t.payload}->>'discriminator', '')`,
      )
      .where(sql`${t.recipientPartyId} is not null`),
    index('notification_outbox_status_idx').on(t.status, t.createdAt),
    check(
      'notification_outbox_one_recipient',
      sql`(${t.recipientUserId} is null) <> (${t.recipientPartyId} is null)`,
    ),
  ],
)

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export const letterMailings = pgTable(
  'letter_mailings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    decisionId: uuid('decision_id')
      .notNull()
      .references(() => boardDecisions.id),
    partyId: uuid('party_id')
      .notNull()
      .references(() => projectParties.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    mailedOn: date('mailed_on', { mode: 'string' }),
    mailedBy: uuid('mailed_by'),
    mailedAt: timestamp('mailed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('letter_mailings_decision_party_uq').on(t.decisionId, t.partyId),
    index('letter_mailings_application_idx').on(t.applicationId),
  ],
)
