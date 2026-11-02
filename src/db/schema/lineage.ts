import { date, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { parcels } from './parcels'

export const parcelLineageEvents = pgTable('parcel_lineage_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['subdivision', 'lot_line_adjustment', 'merge'] }).notNull(),
  effectiveDate: date('effective_date', { mode: 'string' }).notNull(),
  effectiveBasis: text('effective_basis', { enum: ['recording', 'approval'] }).notNull(),
  reference: text('reference'),
  note: text('note'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const parcelLineageLinks = pgTable(
  'parcel_lineage_links',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => parcelLineageEvents.id),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    role: text('role', { enum: ['parent', 'child'] }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.parcelId, t.role] }),
    index('parcel_lineage_links_parcel_idx').on(t.parcelId),
  ],
)
