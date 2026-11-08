import { sql } from 'drizzle-orm'
import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { enforcementCases } from './enforcement'

export const PROVISION_KINDS = [
  'zoning_ordinance',
  'building_code',
  'permit_condition',
  'approved_plan',
  'board_decision',
  'other_local_ordinance',
] as const
export type ProvisionKind = (typeof PROVISION_KINDS)[number]

export const FINDING_STATUSES = ['open', 'corrected', 'withdrawn'] as const
export type FindingStatus = (typeof FINDING_STATUSES)[number]

export const NOTICE_METHODS = [
  'in_hand',
  'first_class_mail',
  'certified_mail',
  'posting',
  'email',
] as const

export const ORDER_STATUSES = [
  'draft',
  'issued',
  'served',
  'answered',
  'filed_with_court',
  'motion_filed',
  'judgment',
  'annulled',
  'withdrawn',
  'complied',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const violationFindings = pgTable(
  'violation_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    provisionKind: text('provision_kind', { enum: PROVISION_KINDS }).notNull(),
    provisionRef: text('provision_ref').notNull(),
    facts: text('facts').notNull(),
    inspectionDate: date('inspection_date', { mode: 'string' }).notNull(),
    foundOn: date('found_on', { mode: 'string' }).notNull(),
    foundBy: uuid('found_by').notNull(),
    status: text('status', { enum: FINDING_STATUSES }).notNull().default('open'),
    withdrawnReason: text('withdrawn_reason'),
    withdrawnBy: uuid('withdrawn_by'),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    correctedOn: date('corrected_on', { mode: 'string' }),
    correctedNote: text('corrected_note'),
    correctedBy: uuid('corrected_by'),
  },
  (t) => [index('violation_findings_case_idx').on(t.caseId)],
)

export const violationNotices = pgTable(
  'violation_notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    findingIds: uuid('finding_ids').array().notNull().default(sql`'{}'::uuid[]`),
    sentOn: date('sent_on', { mode: 'string' }).notNull(),
    method: text('method', { enum: NOTICE_METHODS }).notNull(),
    sentBy: uuid('sent_by').notNull(),
    receivedOn: date('received_on', { mode: 'string' }),
    receiptBasis: text('receipt_basis'),
    documentId: uuid('document_id').references(() => documents.id),
  },
  (t) => [index('violation_notices_case_idx').on(t.caseId)],
)

export const enforcementDesignations = pgTable('enforcement_designations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull(),
  adoptingAuthority: text('adopting_authority').notNull(),
  adoptedOn: date('adopted_on', { mode: 'string' }).notNull(),
  endedOn: date('ended_on', { mode: 'string' }),
})

export const enforcementOrders = pgTable(
  'enforcement_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    number: text('number').notNull().unique(),
    ruleKey: text('rule_key', { enum: ['nh.enf.cd_zoning', 'nh.enf.cd_building'] }).notNull(),
    ruleVersion: integer('rule_version').notNull(),
    findingIds: uuid('finding_ids').array().notNull().default(sql`'{}'::uuid[]`),
    correctiveAction: text('corrective_action').notNull(),
    correctiveDeadline: date('corrective_deadline', { mode: 'string' }),
    ceaseImmediately: boolean('cease_immediately').notNull().default(false),
    status: text('status', { enum: ORDER_STATUSES }).notNull().default('draft'),
    draftedBy: uuid('drafted_by').notNull(),
    issuedOn: date('issued_on', { mode: 'string' }),
    issuedBy: uuid('issued_by'),
    documentId: uuid('document_id').references(() => documents.id),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('enforcement_orders_case_idx').on(t.caseId)],
)
