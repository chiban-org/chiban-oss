import { index, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { parcels } from './parcels'

export const parcelRecordLinks = pgTable(
  'parcel_record_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordKind: text('record_kind').notNull(),
    recordId: uuid('record_id').notNull(),
    parcelId: uuid('parcel_id').references(() => parcels.id),
    rawRefFormat: text('raw_ref_format'),
    rawRefValue: text('raw_ref_value'),
    status: text('status', { enum: ['linked', 'unresolved'] }).notNull(),
    linkedVia: text('linked_via', {
      enum: ['direct', 'retired_alias', 'manual_resolution'],
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('parcel_record_links_unique').on(t.recordKind, t.recordId, t.parcelId),
    index('parcel_record_links_parcel_idx').on(t.parcelId),
    index('parcel_record_links_status_idx').on(t.status),
  ],
)

export const parcelRecordCarryForwards = pgTable(
  'parcel_record_carry_forwards',
  {
    linkId: uuid('link_id')
      .notNull()
      .references(() => parcelRecordLinks.id),
    toParcelId: uuid('to_parcel_id')
      .notNull()
      .references(() => parcels.id),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.linkId, t.toParcelId] })],
)
