import { date, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { parcels } from './parcels'

export const aliasOverrides = pgTable('alias_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  format: text('format').notNull(),
  value: text('value').notNull(),
  parcelId: uuid('parcel_id')
    .notNull()
    .references(() => parcels.id),
  replacedParcelId: uuid('replaced_parcel_id').references(() => parcels.id),
  reason: text('reason').notNull(),
  expiresOn: date('expires_on', { mode: 'string' }),
  supersededBy: uuid('superseded_by'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
