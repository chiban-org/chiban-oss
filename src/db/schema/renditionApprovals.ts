import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { documents, documentVersions } from './documents'
import { rtkRequests } from './rightToKnow'

export const APPROVAL_PURPOSES = ['public', 'rtk_release'] as const
export type ApprovalPurpose = (typeof APPROVAL_PURPOSES)[number]

export const renditionApprovals = pgTable(
  'rendition_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    versionId: uuid('version_id')
      .notNull()
      .references(() => documentVersions.id),
    purpose: text('purpose', { enum: APPROVAL_PURPOSES }).notNull(),
    rtkRequestId: uuid('rtk_request_id').references(() => rtkRequests.id),
    approvedByKind: text('approved_by_kind', { enum: ['user', 'system'] }).notNull(),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
    reviewStatement: text('review_statement').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
    revokeReason: text('revoke_reason'),
  },
  (t) => [
    uniqueIndex('rendition_approvals_one_active_public_idx')
      .on(t.documentId)
      .where(sql`${t.purpose} = 'public' and ${t.revokedAt} is null`),
    index('rendition_approvals_version_idx').on(t.versionId),
    index('rendition_approvals_request_idx').on(t.rtkRequestId),
  ],
)

export type RenditionApprovalRow = typeof renditionApprovals.$inferSelect
