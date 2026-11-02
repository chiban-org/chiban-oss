import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const CENSUS_CATEGORIES = [
  'single_family',
  'two_unit',
  'three_four_unit',
  'five_plus_unit',
  'excluded',
] as const
export const CENSUS_EXCLUDED_REASONS = [
  'publicly_owned',
  'nonresidential',
  'moved_or_relocated',
  'farm_building',
  'manufactured_hud_home',
  'group_quarters',
  'hotel_motel',
  'accessory_structure',
  'demolition',
  'addition_or_alteration',
  'maintenance_repair',
  'reissued_unchanged',
  'unit_of_reported_multifamily',
] as const
export const CENSUS_PHASES = ['whole_building', 'foundation_or_finish_only'] as const

export type CensusCategory = (typeof CENSUS_CATEGORIES)[number]
export type CensusExcludedReason = (typeof CENSUS_EXCLUDED_REASONS)[number]
export type CensusPhase = (typeof CENSUS_PHASES)[number]

export const censusClassifications = pgTable('census_classifications', {
  applicationId: uuid('application_id')
    .primaryKey()
    .references(() => applications.id),
  category: text('category', { enum: CENSUS_CATEGORIES }).notNull(),
  excludedReason: text('excluded_reason', { enum: CENSUS_EXCLUDED_REASONS }),
  phase: text('phase', { enum: CENSUS_PHASES }).notNull().default('whole_building'),
  buildings: integer('buildings').notNull(),
  housingUnits: integer('housing_units').notNull(),
  valuationDollars: integer('valuation_dollars').notNull(),
  classifiedBy: uuid('classified_by').notNull(),
  classifiedAt: timestamp('classified_at', { withTimezone: true }).notNull().defaultNow(),
})
