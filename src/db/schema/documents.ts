import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { files } from './files'
import { migrationBatches } from './migration'

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'number' }).notNull().unique(),
    recordKind: text('record_kind').notNull(),
    recordId: uuid('record_id').notNull(),
    title: text('title').notNull(),
    docKind: text('doc_kind', {
      enum: [
        'attachment',
        'parcel_file',
        'application_snapshot',
        'issued_permit',
        'board_material',
        'inspection_photo',
        'certificate_of_occupancy',
        'enforcement_photo',
        'enforcement_letter',
        'service_proof',
        'court_document',
      ],
    }).notNull(),
    audiences: text('audiences').array().notNull().default(sql`'{}'::text[]`),
    isPublic: boolean('is_public').notNull().default(false),
    publicChangedBy: uuid('public_changed_by'),
    publicChangedAt: timestamp('public_changed_at', { withTimezone: true }),
    createdByKind: text('created_by_kind', {
      enum: ['user', 'system', 'anonymous_public_intake'],
    }).notNull(),
    createdBy: uuid('created_by'),
    migrationBatchId: uuid('migration_batch_id').references(() => migrationBatches.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('documents_record_idx').on(t.recordKind, t.recordId),
    index('documents_migration_batch_idx').on(t.migrationBatchId),
  ],
)

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    role: text('role', { enum: ['original', 'public_redacted', 'pdfa'] }).notNull(),
    fileSha256: text('file_sha256')
      .notNull()
      .references(() => files.sha256),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('document_versions_document_idx').on(t.documentId),
    index('document_versions_file_idx').on(t.fileSha256),
    uniqueIndex('document_versions_one_original_idx')
      .on(t.documentId)
      .where(sql`${t.role} = 'original'`),
  ],
)

export const uploadIntents = pgTable('upload_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  targetKind: text('target_kind').notNull(),
  targetId: uuid('target_id').notNull(),
  title: text('title').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  tempKey: text('temp_key').notNull(),
  seriesKey: text('series_key'),
  docKind: text('doc_kind'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  finalizedAt: timestamp('finalized_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type DocumentRow = typeof documents.$inferSelect
export type DocumentVersionRow = typeof documentVersions.$inferSelect
