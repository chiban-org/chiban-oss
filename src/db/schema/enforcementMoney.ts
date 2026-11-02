import { sql } from 'drizzle-orm'
import { check, date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { enforcementCases } from './enforcement'
import { orderCourtSteps } from './enforcementCourt'
import { enforcementOrders } from './enforcementOrders'

export const FINE_KINDS = ['civil_penalty', 'costs_and_fees', 'restitution'] as const
export const COUNSEL_PURPOSES = [
  'motion_to_enforce',
  'injunction',
  'penalty_action',
  'other',
] as const
export const COUNSEL_OUTCOME_KINDS = [
  'motion_filed',
  'hearing_held',
  'judgment_for_town',
  'judgment_for_respondent',
  'settled',
  'dismissed',
  'withdrawn',
  'appealed_to_superior_court',
] as const

export const counselReferrals = pgTable(
  'counsel_referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    referredOn: date('referred_on', { mode: 'string' }).notNull(),
    counselName: text('counsel_name').notNull(),
    purpose: text('purpose', { enum: COUNSEL_PURPOSES }).notNull(),
    packetDocumentId: uuid('packet_document_id')
      .notNull()
      .references(() => documents.id),
    referredBy: uuid('referred_by').notNull(),
  },
  (t) => [index('counsel_referrals_case_idx').on(t.caseId)],
)

export const counselOutcomes = pgTable(
  'counsel_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referralId: uuid('referral_id')
      .notNull()
      .references(() => counselReferrals.id),
    kind: text('kind', { enum: COUNSEL_OUTCOME_KINDS }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    court: text('court'),
    docket: text('docket'),
    documentId: uuid('document_id').references(() => documents.id),
    note: text('note'),
    recordedBy: uuid('recorded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('counsel_outcomes_referral_idx').on(t.referralId)],
)

export const enforcementFines = pgTable(
  'enforcement_fines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    orderId: uuid('order_id').references(() => enforcementOrders.id),
    kind: text('kind', { enum: FINE_KINDS }).notNull(),
    ruleKey: text('rule_key'),
    amountCents: integer('amount_cents').notNull(),
    imposedOn: date('imposed_on', { mode: 'string' }).notNull(),
    court: text('court').notNull(),
    docket: text('docket').notNull(),
    judgmentStepId: uuid('judgment_step_id').references(() => orderCourtSteps.id),
    counselOutcomeId: uuid('counsel_outcome_id').references(() => counselOutcomes.id),
    recordedBy: uuid('recorded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('enforcement_fines_case_idx').on(t.caseId),
    check('enforcement_fines_amount_positive', sql`${t.amountCents} > 0`),
    check(
      'enforcement_fines_one_basis',
      sql`(${t.judgmentStepId} is not null) <> (${t.counselOutcomeId} is not null)`,
    ),
  ],
)
