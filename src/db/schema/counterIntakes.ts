import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications, projectParties } from './projects'

export const counterIntakes = pgTable(
  'counter_intakes',
  {
    applicationId: uuid('application_id')
      .primaryKey()
      .references(() => applications.id),
    applicantPartyId: uuid('applicant_party_id')
      .notNull()
      .references(() => projectParties.id),
    takenBy: uuid('taken_by').notNull(),
    takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
    paperAttestationRecordedBy: uuid('paper_attestation_recorded_by'),
    paperAttestationRecordedAt: timestamp('paper_attestation_recorded_at', { withTimezone: true }),
  },
  (t) => [index('counter_intakes_taken_at_idx').on(t.takenAt)],
)
