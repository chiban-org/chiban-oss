import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { dispositionBatches } from './disposition'

export const fileDeletions = pgTable('file_deletions', {
  sha256: text('sha256').primaryKey(),
  queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
  batchId: uuid('batch_id')
    .notNull()
    .references(() => dispositionBatches.id),
})

export const fileTombstones = pgTable('file_tombstones', {
  sha256: text('sha256').primaryKey(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  contentType: text('content_type').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).notNull().defaultNow(),
  batchId: uuid('batch_id')
    .notNull()
    .references(() => dispositionBatches.id),
})
