import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const cutoverRows = pgTable('cutover_rows', {
  legacyNumber: text('legacy_number').primaryKey(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id),
  importedBy: uuid('imported_by').notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  sourceSha256: text('source_sha256').notNull(),
})

export const cutoverReconciliations = pgTable('cutover_reconciliations', {
  id: uuid('id').primaryKey().defaultRandom(),
  listSha256: text('list_sha256').notNull(),
  report: jsonb('report').notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  signedOffBy: uuid('signed_off_by'),
  signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
})
