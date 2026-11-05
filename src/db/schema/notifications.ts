import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const NOTIFICATION_EVENTS = [
  'application_submitted',
  'fees_due',
  'payment_received',
  'application_issued',
  'application_denied',
  'review_assigned',
  'inspection_scheduled',
  'inspection_cancelled',
  'inspection_result',
  'permit_corrected',
] as const

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    event: text('event', { enum: NOTIFICATION_EVENTS }).notNull(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    recipientUserId: uuid('recipient_user_id').notNull(),
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
    index('notification_outbox_status_idx').on(t.status, t.createdAt),
  ],
)

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]
