import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const townSettings = pgTable(
  'town_settings',
  {
    id: integer('id').primaryKey().default(1),
    name: text('name').notNull(),
    stateCode: text('state_code').notNull(),
    timeZone: text('time_zone').notNull(),
    basemapRasterUrl: text('basemap_raster_url'),
    basemapAttribution: text('basemap_attribution'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('town_settings_single_row', sql`${t.id} = 1`)],
)
