import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { parcels } from './parcels'
import { applications } from './projects'

export interface AssociationOfficer {
  name: string
  title: string
  mailingAddress: string
}

export interface ParkTenant {
  tenantId: string
  name: string
  mailingAddress: string
  siteLabel: string
}

export const associationRosters = pgTable(
  'association_rosters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    associationName: text('association_name').notNull(),
    officers: jsonb('officers').$type<AssociationOfficer[]>().notNull(),
    asOf: date('as_of', { mode: 'string' }).notNull(),
    checkedOn: date('checked_on', { mode: 'string' }),
    endedOn: date('ended_on', { mode: 'string' }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('association_rosters_parcel_idx').on(t.parcelId).where(sql`${t.endedOn} is null`),
  ],
)

export const parkRosters = pgTable(
  'park_rosters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    parkName: text('park_name').notNull(),
    ownerName: text('owner_name').notNull(),
    ownerMailingAddress: text('owner_mailing_address').notNull(),
    tenants: jsonb('tenants').$type<ParkTenant[]>().notNull(),
    asOf: date('as_of', { mode: 'string' }).notNull(),
    checkedOn: date('checked_on', { mode: 'string' }),
    endedOn: date('ended_on', { mode: 'string' }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('park_rosters_parcel_idx').on(t.parcelId).where(sql`${t.endedOn} is null`)],
)

export const restrictionHoldings = pgTable(
  'restriction_holdings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    holderName: text('holder_name').notNull(),
    holderMailingAddress: text('holder_mailing_address').notNull(),
    restrictionKind: text('restriction_kind', {
      enum: ['conservation', 'preservation', 'agricultural_preservation'],
    }).notNull(),
    recordedReference: text('recorded_reference').notNull(),
    endedOn: date('ended_on', { mode: 'string' }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    checkedOn: date('checked_on', { mode: 'string' }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('restriction_holdings_parcel_idx').on(t.parcelId)],
)

export const rosterReviews = pgTable(
  'roster_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: ['condo', 'park', 'restrictions', 'regional_contacts'] }).notNull(),
    reviewedOn: date('reviewed_on', { mode: 'string' }).notNull(),
    reviewedBy: uuid('reviewed_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('roster_reviews_kind_idx').on(t.kind, t.reviewedOn)],
)

export const applicationProfessionals = pgTable(
  'application_professionals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    name: text('name').notNull(),
    profession: text('profession', {
      enum: ['engineer', 'architect', 'land_surveyor', 'soil_scientist'],
    }).notNull(),
    businessAddress: text('business_address').notNull(),
    sealOnPlat: boolean('seal_on_plat').notNull(),
    addedBy: uuid('added_by').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('application_professionals_application_idx').on(t.applicationId)],
)
