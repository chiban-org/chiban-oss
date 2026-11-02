import { date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { inspections } from './inspections'
import { applications } from './projects'

export const certificatesOfOccupancy = pgTable('certificates_of_occupancy', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .unique()
    .references(() => applications.id),
  number: text('number').notNull().unique(),
  issuedOn: date('issued_on', { mode: 'string' }).notNull(),
  finalInspectionId: uuid('final_inspection_id')
    .notNull()
    .references(() => inspections.id),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id),
  issuedBy: uuid('issued_by').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
})

export type CertificateRow = typeof certificatesOfOccupancy.$inferSelect
