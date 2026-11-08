import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const TOWN_SECTION_KINDS = [
  'zoning_ordinance',
  'building_code',
  'other_local_ordinance',
] as const
export type TownSectionKind = (typeof TOWN_SECTION_KINDS)[number]

export const townSections = pgTable(
  'town_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provisionKind: text('provision_kind', { enum: TOWN_SECTION_KINDS }).notNull(),
    reference: text('reference').notNull(),
    title: text('title').notNull().default(''),
    active: boolean('active').notNull().default(true),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('town_sections_kind_idx').on(t.provisionKind),
    uniqueIndex('town_sections_active_reference_uq')
      .on(t.provisionKind, sql`lower(${t.reference})`)
      .where(sql`${t.active}`),
  ],
)

export type TownSectionRow = typeof townSections.$inferSelect
