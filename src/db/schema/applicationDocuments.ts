import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { applications } from './projects'

export const applicationDocumentLinks = pgTable(
  'application_document_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    itemKey: text('item_key').notNull(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    linkedBy: uuid('linked_by').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('application_document_links_unique_idx').on(
      t.applicationId,
      t.itemKey,
      t.documentId,
    ),
    index('application_document_links_document_idx').on(t.documentId),
  ],
)

export const applicationDocumentItems = pgTable(
  'application_document_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    itemKey: text('item_key').notNull(),
    waiverReason: text('waiver_reason'),
    waiverRequestedBy: uuid('waiver_requested_by'),
    waiverRequestedAt: timestamp('waiver_requested_at', { withTimezone: true }),
    acceptedReason: text('accepted_reason'),
    acceptedBy: uuid('accepted_by'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('application_document_items_unique_idx').on(t.applicationId, t.itemKey)],
)

export type ApplicationDocumentLinkRow = typeof applicationDocumentLinks.$inferSelect
export type ApplicationDocumentItemRow = typeof applicationDocumentItems.$inferSelect
