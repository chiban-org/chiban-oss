import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const clocks = pgTable(
  'clocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    ruleKey: text('rule_key').notNull(),
    ruleVersion: integer('rule_version').notNull(),
    packVersion: text('pack_version').notNull(),
    startEvent: text('start_event').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    lengthValue: integer('length_value').notNull(),
    lengthUnit: text('length_unit', { enum: ['days', 'months'] }).notNull(),
    countingMethod: text('counting_method').notNull(),
    computedDue: date('computed_due', { mode: 'string' }).notNull(),
    currentDue: date('current_due', { mode: 'string' }).notNull(),
    rolledFrom: date('rolled_from', { mode: 'string' }),
    status: text('status', {
      enum: ['running', 'met', 'overdue', 'stopped', 'superseded', 'lapsed'],
    })
      .notNull()
      .default('running'),
    metOn: date('met_on', { mode: 'string' }),
    source: text('source', { enum: ['pack_rule', 'town_setting'] }).notNull(),
    replacedDue: date('replaced_due', { mode: 'string' }),
    supersededBy: uuid('superseded_by'),
    supersededReason: text('superseded_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('clocks_application_idx').on(t.applicationId),
    index('clocks_status_idx').on(t.status),
  ],
)

export const clockAdjustments = pgTable(
  'clock_adjustments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clockId: uuid('clock_id')
      .notNull()
      .references(() => clocks.id),
    kind: text('kind', {
      enum: ['extension', 'waiver', 'renewal', 'tolling', 'statutory_exception', 'statutory_floor'],
    }).notNull(),
    days: integer('days'),
    newDue: date('new_due', { mode: 'string' }),
    reason: text('reason').notNull(),
    legalAuthority: jsonb('legal_authority'),
    applicantConsent: boolean('applicant_consent').notNull().default(false),
    supersededBy: uuid('superseded_by'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('clock_adjustments_clock_idx').on(t.clockId)],
)
