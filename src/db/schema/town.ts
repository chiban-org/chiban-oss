import { sql } from 'drizzle-orm'
import { check, date, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const SERVICE_STATUSES = ['active', 'suspended', 'terminated'] as const

export const townSettings = pgTable(
  'town_settings',
  {
    id: integer('id').primaryKey().default(1),
    name: text('name').notNull(),
    stateCode: text('state_code').notNull(),
    timeZone: text('time_zone').notNull(),
    basemapRasterUrl: text('basemap_raster_url'),
    basemapAttribution: text('basemap_attribution'),
    serviceStatus: text('service_status', { enum: SERVICE_STATUSES }).notNull().default('active'),
    serviceStatusSince: date('service_status_since', { mode: 'string' }),
    exportWindowDays: integer('export_window_days').notNull().default(90),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('town_settings_single_row', sql`${t.id} = 1`)],
)
