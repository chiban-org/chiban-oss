import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
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
import {
  ALLOCATION_TARGETS,
  LEDGER_ENTRY_TYPES,
  PAYMENT_METHODS,
  PROCESSORS,
} from '@/features/ledger/types'
import { feeAssessments } from './fees'
import { applications } from './projects'
import { receipts } from './receipts'

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryType: text('entry_type', { enum: LEDGER_ENTRY_TYPES }).notNull(),
    method: text('method', { enum: PAYMENT_METHODS }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    receiptId: uuid('receipt_id').references(() => receipts.id),
    reversesEntryId: uuid('reverses_entry_id').references((): AnyPgColumn => ledgerEntries.id),
    paymentAttemptId: uuid('payment_attempt_id'),
    processor: text('processor', { enum: PROCESSORS }),
    processorAccountId: uuid('processor_account_id'),
    processorObjectId: text('processor_object_id'),
    checkNumber: text('check_number'),
    payerName: text('payer_name').notNull(),
    payerUserId: uuid('payer_user_id'),
    reason: text('reason'),
    actorKind: text('actor_kind', { enum: ['user', 'system'] }).notNull(),
    actorUserId: uuid('actor_user_id'),
    actorJob: text('actor_job'),
  },
  (t) => [
    check(
      'ledger_entries_sign',
      sql`(${t.entryType} = 'payment' and ${t.amountCents} > 0)
        or (${t.entryType} in ('refund', 'returned_check', 'chargeback') and ${t.amountCents} < 0)
        or ${t.entryType} = 'correction'`,
    ),
    check(
      'ledger_entries_reverses',
      sql`(${t.entryType} = 'payment' and ${t.reversesEntryId} is null)
        or (${t.entryType} <> 'payment' and ${t.reversesEntryId} is not null)`,
    ),
    check(
      'ledger_entries_reason',
      sql`${t.entryType} not in ('refund', 'returned_check', 'correction') or ${t.reason} is not null`,
    ),
    check(
      'ledger_entries_processor_triple',
      sql`(${t.processor} is null) = (${t.processorAccountId} is null)
        and (${t.processor} is null) = (${t.processorObjectId} is null)`,
    ),
    uniqueIndex('ledger_entries_processor_object_uq')
      .on(t.processorAccountId, t.processorObjectId, t.entryType)
      .where(sql`${t.processorObjectId} is not null`),
    index('ledger_entries_business_date_idx').on(t.businessDate),
    index('ledger_entries_reverses_idx').on(t.reversesEntryId),
    index('ledger_entries_payer_idx').on(t.payerUserId),
  ],
)

export const ledgerAllocations = pgTable(
  'ledger_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => ledgerEntries.id),
    targetKind: text('target_kind', { enum: ALLOCATION_TARGETS }).notNull(),
    applicationId: uuid('application_id').references(() => applications.id),
    feeAssessmentId: uuid('fee_assessment_id').references(() => feeAssessments.id),
    stage: text('stage', { enum: ['at_intake', 'at_approval', 'at_renewal'] }),
    feeCode: text('fee_code'),
    amountCents: integer('amount_cents').notNull(),
  },
  (t) => [
    check(
      'ledger_allocations_line_fields',
      sql`${t.targetKind} <> 'fee_assessment_line'
        or (${t.applicationId} is not null and ${t.feeAssessmentId} is not null
          and ${t.stage} is not null and ${t.feeCode} is not null)`,
    ),
    check('ledger_allocations_nonzero', sql`${t.amountCents} <> 0`),
    index('ledger_allocations_entry_idx').on(t.entryId),
    index('ledger_allocations_line_idx').on(t.applicationId, t.stage, t.feeCode),
  ],
)

export type LedgerEntryRow = typeof ledgerEntries.$inferSelect
export type LedgerAllocationRow = typeof ledgerAllocations.$inferSelect
