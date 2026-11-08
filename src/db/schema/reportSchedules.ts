import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './identity'

export const SCHEDULABLE_REPORTS = [
  'permit-volume',
  'processing-time',
  'revenue',
  'cash-receipts',
  'census',
] as const

export const REPORT_FREQUENCIES = ['weekly', 'monthly', 'quarterly'] as const

export const reportSchedules = pgTable(
  'report_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    report: text('report', { enum: SCHEDULABLE_REPORTS }).notNull(),
    frequency: text('frequency', { enum: REPORT_FREQUENCIES }).notNull(),
    paused: boolean('paused').notNull().default(false),
    nextRunOn: date('next_run_on', { mode: 'string' }).notNull(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    lastPeriodFrom: date('last_period_from', { mode: 'string' }),
    lastPeriodTo: date('last_period_to', { mode: 'string' }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('report_schedules_due_idx').on(t.nextRunOn).where(sql`${t.paused} = false`)],
)

export const reportScheduleRecipients = pgTable(
  'report_schedule_recipients',
  {
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => reportSchedules.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.scheduleId, t.userId] })],
)

export const reportScheduleDeliveries = pgTable(
  'report_schedule_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scheduleId: uuid('schedule_id')
      .notNull()
      .references(() => reportSchedules.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    periodFrom: date('period_from', { mode: 'string' }).notNull(),
    periodTo: date('period_to', { mode: 'string' }).notNull(),
    outcome: text('outcome', { enum: ['sent', 'skipped_no_access'] }).notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('report_schedule_deliveries_once_idx').on(
      t.scheduleId,
      t.userId,
      t.periodFrom,
      t.periodTo,
    ),
  ],
)
