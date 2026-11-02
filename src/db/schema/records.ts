import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { enforcementCases } from './enforcement'
import { applications, projects } from './projects'

export const retentionAssignments = pgTable(
  'retention_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordKind: text('record_kind', { enum: ['document', 'application_snapshot'] }).notNull(),
    recordId: uuid('record_id').notNull(),
    seriesKey: text('series_key').notNull(),
    seriesVersion: integer('series_version').notNull(),
    reason: text('reason', { enum: ['default', 'outcome', 'staff'] }).notNull(),
    assignedByKind: text('assigned_by_kind', { enum: ['user', 'system'] }).notNull(),
    assignedBy: uuid('assigned_by'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('retention_assignments_current_idx')
      .on(t.recordKind, t.recordId)
      .where(sql`${t.supersededAt} is null`),
    index('retention_assignments_series_idx').on(t.seriesKey),
  ],
)

export const recordEvents = pgTable(
  'record_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id),
    caseId: uuid('case_id').references(() => enforcementCases.id),
    applicationId: uuid('application_id').references(() => applications.id),
    kind: text('kind', {
      enum: [
        'application_withdrawn',
        'application_denied',
        'building_removed',
        'registration_expired',
        'septic_replaced_or_removed',
        'appeal_period_expired',
      ],
    }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    recordedByKind: text('recorded_by_kind', { enum: ['user', 'system'] }).notNull(),
    recordedBy: uuid('recorded_by'),
    note: text('note'),
  },
  (t) => [
    index('record_events_project_idx').on(t.projectId),
    index('record_events_case_idx').on(t.caseId),
    check('record_events_one_target_check', sql`(${t.projectId} is null) <> (${t.caseId} is null)`),
  ],
)

export const legalHolds = pgTable(
  'legal_holds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetKind: text('target_kind', {
      enum: ['project', 'application', 'document', 'enforcement_case', 'rtk_request'],
    }).notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text('reason').notNull(),
    placedBy: uuid('placed_by').notNull(),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    releasedBy: uuid('released_by'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releaseReason: text('release_reason'),
  },
  (t) => [index('legal_holds_target_idx').on(t.targetKind, t.targetId)],
)

export type RetentionAssignmentRow = typeof retentionAssignments.$inferSelect
export type RecordEventRow = typeof recordEvents.$inferSelect
export type LegalHoldRow = typeof legalHolds.$inferSelect
