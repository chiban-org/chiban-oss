import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const LICENSE_RESULTS = ['active', 'not_found', 'expired', 'inactive'] as const
export type LicenseResult = (typeof LICENSE_RESULTS)[number]

export const licenseChecks = pgTable(
  'license_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    licenseNumber: text('license_number').notNull(),
    licenseType: text('license_type').notNull(),
    result: text('result', { enum: LICENSE_RESULTS }).notNull(),
    note: text('note'),
    lookupUrl: text('lookup_url').notNull(),
    checkedBy: uuid('checked_by').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('license_checks_application_idx').on(t.applicationId)],
)
