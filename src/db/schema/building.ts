import { date, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const codeEditionRecords = pgTable('code_edition_records', {
  applicationId: uuid('application_id')
    .primaryKey()
    .references(() => applications.id),
  receiptDate: date('receipt_date', { mode: 'string' }).notNull(),
  completedDate: date('completed_date', { mode: 'string' }),
  classification: text('classification'),
  dwellingUnits: integer('dwelling_units'),
  editionKey: text('edition_key').notNull(),
  editionLabel: text('edition_label').notNull(),
  editionStatus: text('edition_status', { enum: ['verified', 'unverified'] }).notNull(),
  applicantElection: text('applicant_election'),
  localAmendmentsInForce: jsonb('local_amendments_in_force').notNull(),
  recordedBy: uuid('recorded_by').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
})
