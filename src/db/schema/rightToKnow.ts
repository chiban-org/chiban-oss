import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import { documents, documentVersions } from './documents'
import { renditionApprovals } from './renditionApprovals'

export const RTK_RECEIVED_VIA = ['in_person', 'mail', 'email', 'portal', 'phone'] as const
export const RTK_STATUSES = [
  'open',
  'responded',
  'awaiting_decision',
  'closed',
  'withdrawn',
] as const
export const RTK_RESPONSE_KINDS = [
  'made_available',
  'website_reference',
  'denied',
  'time_statement',
] as const
export const RTK_WITHHOLDING_SCOPES = ['withheld_in_full', 'redacted'] as const

export type RtkStatus = (typeof RTK_STATUSES)[number]
export type RtkResponseKind = (typeof RTK_RESPONSE_KINDS)[number]
export type RtkCostLine = { label: string; cents: number }

export const rtkRequests = pgTable(
  'rtk_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    receivedOn: date('received_on', { mode: 'string' }).notNull(),
    receivedVia: text('received_via', { enum: RTK_RECEIVED_VIA }).notNull(),
    requesterName: text('requester_name'),
    requesterContact: text('requester_contact'),
    description: text('description').notNull(),
    status: text('status', { enum: RTK_STATUSES }).notNull().default('open'),
    responseDue: jsonb('response_due').$type<SubjectDue>().notNull(),
    statedDue: jsonb('stated_due').$type<SubjectDue>(),
    openDueOn: date('open_due_on', { mode: 'string' }),
    firstResponseOn: date('first_response_on', { mode: 'string' }),
    firstResponseKind: text('first_response_kind', { enum: RTK_RESPONSE_KINDS }),
    firstResponseUrl: text('first_response_url'),
    deniedOn: date('denied_on', { mode: 'string' }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rowVersion: integer('row_version').notNull().default(1),
  },
  (t) => [
    index('rtk_requests_status_due_idx').on(t.status, t.openDueOn),
    index('rtk_requests_due_idx').on(t.openDueOn, t.id),
  ],
)

export const rtkTimeStatements = pgTable('rtk_time_statements', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id')
    .notNull()
    .references(() => rtkRequests.id),
  statedOn: date('stated_on', { mode: 'string' }).notNull(),
  statedDate: date('stated_date', { mode: 'string' }).notNull(),
  delayReason: text('delay_reason').notNull(),
  costEstimate: jsonb('cost_estimate').$type<RtkCostLine[]>().notNull().default(sql`'[]'::jsonb`),
})

export const rtkWithholdings = pgTable(
  'rtk_withholdings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => rtkRequests.id),
    releaseId: uuid('release_id').references((): AnyPgColumn => rtkReleases.id),
    scope: text('scope', { enum: RTK_WITHHOLDING_SCOPES }).notNull(),
    documentId: uuid('document_id'),
    recordDescription: text('record_description').notNull(),
    exemptionKey: text('exemption_key').notNull(),
    otherCitation: text('other_citation'),
    explanation: text('explanation').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rtk_withholdings_request_idx').on(t.requestId)],
)

export const RTK_RELEASE_METHODS = ['inspection', 'paper', 'electronic_link', 'email'] as const

export const rtkReleases = pgTable(
  'rtk_releases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => rtkRequests.id),
    sequence: integer('sequence').notNull(),
    releasedOn: date('released_on', { mode: 'string' }).notNull(),
    method: text('method', { enum: RTK_RELEASE_METHODS }).notNull(),
    letterDocumentId: uuid('letter_document_id').references(() => documents.id),
    releasedBy: uuid('released_by').notNull(),
    linkTokenHash: text('link_token_hash'),
    linkExpiresAt: timestamp('link_expires_at', { withTimezone: true }),
    linkRevokedAt: timestamp('link_revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('rtk_releases_request_sequence_unique').on(t.requestId, t.sequence)],
)

export const rtkReleaseItems = pgTable(
  'rtk_release_items',
  {
    releaseId: uuid('release_id')
      .notNull()
      .references(() => rtkReleases.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    versionId: uuid('version_id').references(() => documentVersions.id),
    formerVersionId: uuid('former_version_id'),
    approvalId: uuid('approval_id').references(() => renditionApprovals.id),
    position: integer('position').notNull(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnReason: text('withdrawn_reason', { enum: ['revoked', 'disposed'] }),
  },
  (t) => [primaryKey({ columns: [t.releaseId, t.documentId] })],
)

export const rtkReleaseLinks = pgTable(
  'rtk_release_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => rtkReleases.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    sentTo: text('sent_to').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rtk_release_links_release_idx').on(t.releaseId)],
)

export const RTK_LETTER_OUTCOMES = ['emailed', 'email_failed', 'print'] as const
export type RtkLetterOutcome = (typeof RTK_LETTER_OUTCOMES)[number]

export const rtkLetterDeliveries = pgTable(
  'rtk_letter_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => rtkRequests.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    outcome: text('outcome', { enum: RTK_LETTER_OUTCOMES }).notNull(),
    sentTo: text('sent_to'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('rtk_letter_deliveries_request_idx').on(t.requestId)],
)
