import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
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

export const abutterLists = pgTable(
  'abutter_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    version: integer('version').notNull(),
    status: text('status', { enum: ['draft', 'issued', 'superseded', 'discarded'] })
      .notNull()
      .default('draft'),
    strategyKey: text('strategy_key').notNull(),
    strategyVersion: integer('strategy_version').notNull(),
    resolverKey: text('resolver_key').notNull(),
    resolverVersion: integer('resolver_version').notNull(),
    drawnOn: date('drawn_on', { mode: 'string' }).notNull(),
    layers: jsonb('layers').notNull(),
    incomplete: jsonb('incomplete').notNull(),
    crossingsAttestedBy: uuid('crossings_attested_by'),
    crossingsAttestedAt: timestamp('crossings_attested_at', { withTimezone: true }),
    issuedBy: uuid('issued_by'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    snapshot: jsonb('snapshot'),
    snapshotSha256: text('snapshot_sha256'),
    supersededBy: uuid('superseded_by'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('abutter_lists_version_unique').on(t.applicationId, t.version),
    uniqueIndex('abutter_lists_one_issued_idx')
      .on(t.applicationId)
      .where(sql`${t.status} = 'issued'`),
  ],
)

export const abutterListCandidates = pgTable(
  'abutter_list_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => abutterLists.id),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    reasons: jsonb('reasons').notNull(),
    excluded: boolean('excluded').notNull().default(false),
    exclusionReason: text('exclusion_reason'),
  },
  (t) => [unique('abutter_list_candidates_unique').on(t.listId, t.parcelId)],
)

export const abutterListRecipients = pgTable(
  'abutter_list_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => abutterLists.id),
    originKey: text('origin_key').notNull(),
    position: integer('position').notNull(),
    data: jsonb('data').notNull(),
    excluded: boolean('excluded').notNull().default(false),
    exclusionReason: text('exclusion_reason'),
    qualifies: boolean('qualifies'),
    decisionReason: text('decision_reason'),
  },
  (t) => [unique('abutter_list_recipients_unique').on(t.listId, t.originKey)],
)
