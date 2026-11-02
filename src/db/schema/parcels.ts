import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { geometryColumn } from '@/db/types/geometry'

export const parcels = pgTable(
  'parcels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    geom: geometryColumn('geom', { type: 'MultiPolygon', srid: 4326 }),
    siteAddress: text('site_address'),
    ownerName: text('owner_name'),
    mailingAddress: text('mailing_address'),
    status: text('status', { enum: ['active', 'retired'] })
      .notNull()
      .default('active'),
    retiredOn: date('retired_on', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('parcels_geom_gist').using('gist', t.geom),
    index('parcels_site_address_trgm').using('gin', sql`${t.siteAddress} gin_trgm_ops`),
    index('parcels_owner_name_trgm').using('gin', sql`${t.ownerName} gin_trgm_ops`),
  ],
)

export const parcelIdFormats = pgTable(
  'parcel_id_formats',
  {
    key: text('key').primaryKey(),
    label: text('label').notNull(),
    kind: text('kind', { enum: ['digits', 'free_text'] }).notNull(),
    width: integer('width'),
    isDisplay: boolean('is_display').notNull().default(false),
  },
  (t) => [uniqueIndex('parcel_id_formats_one_display').on(t.isDisplay).where(sql`${t.isDisplay}`)],
)

export const parcelAliases = pgTable(
  'parcel_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    format: text('format')
      .notNull()
      .references(() => parcelIdFormats.key),
    value: text('value').notNull(),
    valueNormalized: text('value_normalized').notNull(),
    status: text('status', { enum: ['active', 'retired'] })
      .notNull()
      .default('active'),
    source: text('source', { enum: ['import', 'manual', 'override'] }).notNull(),
    retiredOn: date('retired_on', { mode: 'string' }),
    retiredReason: text('retired_reason', {
      enum: ['lineage', 'overridden', 'expired', 'manual'],
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('parcel_aliases_active_unique')
      .on(t.format, t.value)
      .where(sql`${t.status} = 'active'`),
    index('parcel_aliases_normalized_idx').using(
      'btree',
      sql`${t.valueNormalized} text_pattern_ops`,
    ),
    index('parcel_aliases_parcel_idx').on(t.parcelId),
  ],
)
