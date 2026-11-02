import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { configVersions } from './config'
import { applications } from './projects'

export const INSPECTION_STATUSES = [
  'requested',
  'scheduled',
  'passed',
  'failed',
  'cancelled',
] as const
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number]

export const INSPECTION_CHANNELS = ['phone', 'counter', 'portal'] as const
export type InspectionChannel = (typeof INSPECTION_CHANNELS)[number]

export const INSPECTION_CANCEL_REASONS = [
  'requester',
  'staff',
  'permit_suspended',
  'permit_expired',
  'permit_closed',
] as const
export type InspectionCancelReason = (typeof INSPECTION_CANCEL_REASONS)[number]

export const inspections = pgTable(
  'inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    checklistVersionId: uuid('checklist_version_id')
      .notNull()
      .references(() => configVersions.id),
    inspectionType: text('inspection_type').notNull(),
    isFinal: boolean('is_final').notNull().default(false),
    status: text('status', { enum: INSPECTION_STATUSES }).notNull().default('requested'),
    channel: text('channel', { enum: INSPECTION_CHANNELS }).notNull(),
    requestedByUserId: uuid('requested_by_user_id'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    preferredDate: date('preferred_date', { mode: 'string' }),
    contactName: text('contact_name').notNull(),
    contactPhone: text('contact_phone'),
    accessNotes: text('access_notes'),
    reinspectionOf: uuid('reinspection_of'),
    inspectorUserId: uuid('inspector_user_id'),
    scheduledDate: date('scheduled_date', { mode: 'string' }),
    startMinute: integer('start_minute'),
    durationMinutes: integer('duration_minutes'),
    calendarSequence: integer('calendar_sequence').notNull().default(0),
    resultNotes: text('result_notes'),
    resultRecordedBy: uuid('result_recorded_by'),
    resultRecordedAt: timestamp('result_recorded_at', { withTimezone: true }),
    cancelReason: text('cancel_reason', { enum: INSPECTION_CANCEL_REASONS }),
    offGridReason: text('off_grid_reason'),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inspections_application_idx').on(t.applicationId),
    index('inspections_day_idx').on(t.inspectorUserId, t.scheduledDate),
    uniqueIndex('inspections_slot_idx')
      .on(t.inspectorUserId, t.scheduledDate, t.startMinute)
      .where(sql`${t.status} = 'scheduled'`),
    uniqueIndex('inspections_one_open_reinspection_idx')
      .on(t.reinspectionOf)
      .where(sql`${t.status} in ('requested', 'scheduled')`),
  ],
)

export const inspectionItemResults = pgTable(
  'inspection_item_results',
  {
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id),
    itemKey: text('item_key').notNull(),
    labelSnapshot: text('label_snapshot').notNull(),
    required: boolean('required').notNull(),
    outcome: text('outcome', { enum: ['pass', 'fail', 'na'] }).notNull(),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.inspectionId, t.itemKey] })],
)

export type InspectionRow = typeof inspections.$inferSelect
export type InspectionItemResultRow = typeof inspectionItemResults.$inferSelect
