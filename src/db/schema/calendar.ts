import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { citext } from './identity'
import { inspections } from './inspections'

export const CALENDAR_KINDS = ['ics_email', 'graph'] as const
export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export const inspectorCalendars = pgTable('inspector_calendars', {
  userId: uuid('user_id').primaryKey(),
  kind: text('kind', { enum: CALENDAR_KINDS }).notNull(),
  email: citext('email').notNull(),
  graphUserId: text('graph_user_id'),
  updatedBy: uuid('updated_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const calendarPushes = pgTable(
  'calendar_pushes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id),
    sequence: integer('sequence').notNull(),
    op: text('op', { enum: ['publish', 'cancel'] }).notNull(),
    inspectorUserId: uuid('inspector_user_id').notNull(),
    targetKind: text('target_kind', { enum: CALENDAR_KINDS }).notNull(),
    scheduledDate: date('scheduled_date', { mode: 'string' }).notNull(),
    startMinute: integer('start_minute').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    status: text('status', { enum: ['queued', 'sent', 'failed'] })
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    externalRef: text('external_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('calendar_pushes_dedup_idx').on(
      t.inspectionId,
      t.sequence,
      t.op,
      t.inspectorUserId,
    ),
    index('calendar_pushes_status_idx').on(t.status, t.createdAt),
  ],
)

export type CalendarPushRow = typeof calendarPushes.$inferSelect
