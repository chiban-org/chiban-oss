import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core'
import { parcels } from './parcels'
import { applications } from './projects'

export const applicationParcels = pgTable(
  'application_parcels',
  {
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    addedBy: uuid('added_by').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.applicationId, t.parcelId] }),
    index('application_parcels_parcel_idx').on(t.parcelId),
  ],
)
