import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const noticeSets = pgTable(
  'notice_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subjectKind: text('subject_kind').notNull(),
    subjectId: uuid('subject_id').notNull(),
    applicationId: uuid('application_id'),
    anchorDate: date('anchor_date', { mode: 'string' }).notNull(),
    inheritedFrom: uuid('inherited_from'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notice_sets_subject_idx').on(t.subjectKind, t.subjectId)],
)

export const noticeItems = pgTable(
  'notice_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    setId: uuid('set_id')
      .notNull()
      .references(() => noticeSets.id),
    requirementKey: text('requirement_key').notNull(),
    requirementVersion: integer('requirement_version').notNull(),
    source: text('source', { enum: ['pack_rule', 'town_setting'] }).notNull(),
    channel: text('channel').notNull(),
    recipientKey: text('recipient_key'),
    recipientName: text('recipient_name'),
    recipientAddress: text('recipient_address'),
    roles: text('roles').array().notNull().default(sql`'{}'::text[]`),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    countingMethod: text('counting_method').notNull(),
  },
  (t) => [index('notice_items_set_idx').on(t.setId)],
)

export const noticeProofs = pgTable(
  'notice_proofs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => noticeItems.id),
    method: text('method').notNull(),
    reference: text('reference'),
    effectiveOn: date('effective_on', { mode: 'string' }).notNull(),
    documentId: uuid('document_id').notNull(),
    recordedBy: uuid('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notice_proofs_item_idx').on(t.itemId)],
)

export const noticeProofSupersessions = pgTable(
  'notice_proof_supersessions',
  {
    proofId: uuid('proof_id')
      .primaryKey()
      .references(() => noticeProofs.id),
    supersededByProofId: uuid('superseded_by_proof_id')
      .notNull()
      .references(() => noticeProofs.id),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notice_proof_supersessions_by_idx').on(t.supersededByProofId, t.proofId)],
)
