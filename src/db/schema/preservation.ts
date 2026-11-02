import { type SQL, sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { documentVersions } from './documents'

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const preservationRecords = pgTable(
  'preservation_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    originalVersionId: uuid('original_version_id')
      .notNull()
      .unique()
      .references(() => documentVersions.id),
    required: boolean('required').notNull(),
    status: text('status', {
      enum: ['not_required', 'pending', 'complete', 'incomplete'],
    }).notNull(),
    reason: text('reason'),
    detail: text('detail'),
    attempts: integer('attempts').notNull().default(0),
    pdfaVersionId: uuid('pdfa_version_id').references(() => documentVersions.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('preservation_records_status_idx').on(t.status)],
)

export const documentText = pgTable(
  'document_text',
  {
    versionId: uuid('version_id')
      .primaryKey()
      .references(() => documentVersions.id),
    text: text('text').notNull(),
    hasTextLayer: boolean('has_text_layer').notNull(),
    tsv: tsvector('tsv').generatedAlwaysAs((): SQL => sql`to_tsvector('english', "text")`),
  },
  (t) => [index('document_text_tsv_idx').using('gin', t.tsv)],
)

export type PreservationRecordRow = typeof preservationRecords.$inferSelect
