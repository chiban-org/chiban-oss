import {
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const DISPOSITION_STATUSES = [
  'proposed',
  'approved',
  'executing',
  'executed',
  'cancelled',
] as const
export const DISPOSITION_OUTCOMES = ['disposed', 'skipped_hold', 'skipped_not_eligible'] as const
export const DISPOSITION_RECORD_KINDS = ['document', 'application_snapshot'] as const

export type DispositionStatus = (typeof DISPOSITION_STATUSES)[number]
export type DispositionOutcome = (typeof DISPOSITION_OUTCOMES)[number]

export interface RetentionBasis {
  state: string
  eligibleOn: string | null
  events: { kind: string; occurredOn: string }[]
}

export const dispositionBatches = pgTable(
  'disposition_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    asOf: date('as_of', { mode: 'string' }).notNull(),
    status: text('status', { enum: DISPOSITION_STATUSES }).notNull().default('proposed'),
    proposedBy: uuid('proposed_by').notNull(),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [index('disposition_batches_status_idx').on(t.status, t.proposedAt)],
)

export const dispositionTombstones = pgTable(
  'disposition_tombstones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => dispositionBatches.id),
    recordKind: text('record_kind', { enum: DISPOSITION_RECORD_KINDS }).notNull(),
    recordId: uuid('record_id').notNull(),
    title: text('title').notNull(),
    seriesKey: text('series_key').notNull(),
    seriesVersion: text('series_version').notNull(),
    seriesCitation: jsonb('series_citation')
      .$type<{ label: string; url: string | null }>()
      .notNull(),
    retentionBasis: jsonb('retention_basis').$type<RetentionBasis>().notNull(),
    versionIds: uuid('version_ids').array().notNull(),
    fileSha256s: text('file_sha256s').array().notNull(),
    proposedBy: uuid('proposed_by').notNull(),
    approvedBy: uuid('approved_by').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('disposition_tombstones_record_uq').on(t.recordKind, t.recordId)],
)

export const dispositionItems = pgTable(
  'disposition_items',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => dispositionBatches.id),
    recordKind: text('record_kind', { enum: DISPOSITION_RECORD_KINDS }).notNull(),
    recordId: uuid('record_id').notNull(),
    seriesKey: text('series_key').notNull(),
    seriesVersion: text('series_version').notNull(),
    eligibleOn: date('eligible_on', { mode: 'string' }).notNull(),
    outcome: text('outcome', { enum: DISPOSITION_OUTCOMES }),
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.recordKind, t.recordId] }),
    index('disposition_items_record_idx').on(t.recordKind, t.recordId),
  ],
)
