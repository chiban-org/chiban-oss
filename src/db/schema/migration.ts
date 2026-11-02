import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { documents } from './documents'

export const migrationBatches = pgTable('migration_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sourceRoot: text('source_root').notNull(),
  seriesKey: text('series_key').notNull(),
  folderPattern: text('folder_pattern').notNull(),
  idFormat: text('id_format').notNull(),
  status: text('status', { enum: ['scanned', 'running', 'staged', 'published'] }).notNull(),
  report: jsonb('report'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const migrationItems = pgTable(
  'migration_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => migrationBatches.id),
    sourcePath: text('source_path').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text('sha256').notNull(),
    folderKey: text('folder_key'),
    outcome: text('outcome', {
      enum: ['imported', 'duplicate_linked', 'excepted', 'skipped'],
    }),
    exceptReason: text('except_reason', {
      enum: ['unparseable_folder', 'unsupported_type', 'read_error'],
    }),
    documentId: uuid('document_id').references(() => documents.id),
    duplicateOfItem: uuid('duplicate_of_item'),
    parcelLink: text('parcel_link', { enum: ['linked', 'unresolved', 'none'] })
      .notNull()
      .default('none'),
    ocrStatus: text('ocr_status', { enum: ['complete', 'failed', 'not_attempted'] })
      .notNull()
      .default('not_attempted'),
    ocrReason: text('ocr_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('migration_items_batch_path_unique').on(t.batchId, t.sourcePath),
    index('migration_items_batch_idx').on(t.batchId),
    index('migration_items_sha_idx').on(t.sha256),
    check(
      'migration_items_excepted_has_reason',
      sql`(${t.outcome} = 'excepted') = (${t.exceptReason} is not null)`,
    ),
  ],
)
