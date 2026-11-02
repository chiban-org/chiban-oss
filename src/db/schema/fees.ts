import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const feeAssessments = pgTable(
  'fee_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    stage: text('stage', {
      enum: ['at_intake', 'at_approval', 'at_renewal', 'at_notice'],
    }).notNull(),
    sequence: integer('sequence').notNull(),
    scheduleVersionId: uuid('schedule_version_id').notNull(),
    computation: jsonb('computation').notNull(),
    totalCents: integer('total_cents').notNull(),
    assessedBy: text('assessed_by').notNull(),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('fee_assessments_seq_uq').on(t.applicationId, t.stage, t.sequence)],
)

export const feeOverrides = pgTable(
  'fee_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    feeCode: text('fee_code').notNull(),
    kind: text('kind', { enum: ['waive', 'set_amount'] }).notNull(),
    amountCents: integer('amount_cents'),
    reason: text('reason').notNull(),
    supersededBy: uuid('superseded_by'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('fee_overrides_application_idx').on(t.applicationId)],
)
