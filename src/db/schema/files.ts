import { bigint, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const files = pgTable('files', {
  sha256: text('sha256').primaryKey(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  contentType: text('content_type').notNull(),
  storageKey: text('storage_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export type FileRow = typeof files.$inferSelect
