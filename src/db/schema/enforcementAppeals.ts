import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { enforcementCases } from './enforcement'

export const PERIL_CATEGORIES = ['life', 'health', 'safety', 'property', 'environment'] as const
export const ENFORCEMENT_APPEAL_OUTCOMES = ['upheld', 'modified', 'annulled', 'withdrawn'] as const

export const enforcementAppeals = pgTable(
  'enforcement_appeals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    targetKind: text('target_kind', { enum: ['order', 'notice'] }).notNull(),
    targetId: uuid('target_id').notNull(),
    filedOn: date('filed_on', { mode: 'string' }).notNull(),
    appellantName: text('appellant_name').notNull(),
    board: text('board', { enum: ['zba'] })
      .notNull()
      .default('zba'),
    resolvedOn: date('resolved_on', { mode: 'string' }),
    outcome: text('outcome', { enum: ENFORCEMENT_APPEAL_OUTCOMES }),
    recordedBy: uuid('recorded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('enforcement_appeals_case_idx').on(t.caseId)],
)

export const perilCertifications = pgTable('peril_certifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  appealId: uuid('appeal_id')
    .notNull()
    .references(() => enforcementAppeals.id),
  certifiedOn: date('certified_on', { mode: 'string' }).notNull(),
  certifiedBy: uuid('certified_by').notNull(),
  categories: text('categories').array().notNull(),
  statement: text('statement').notNull(),
})

export const restrainingOrders = pgTable('restraining_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  appealId: uuid('appeal_id')
    .notNull()
    .references(() => enforcementAppeals.id),
  issuedBy: text('issued_by', { enum: ['zba', 'superior_court'] }).notNull(),
  issuedOn: date('issued_on', { mode: 'string' }).notNull(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id),
  dissolvedOn: date('dissolved_on', { mode: 'string' }),
})
