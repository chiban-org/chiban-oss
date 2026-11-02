import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { geometryColumn } from '@/db/types/geometry'
import { IMPORT_EXCEPTION_KINDS, LAYER_ADAPTERS, LAYER_KEYS } from '@/features/gis/exceptionKinds'

export const gisLayers = pgTable('gis_layers', {
  key: text('key', { enum: LAYER_KEYS }).primaryKey(),
  required: boolean('required').notNull().default(false),
  adapter: text('adapter', { enum: LAYER_ADAPTERS }),
  sourceUrl: text('source_url'),
  mapping: jsonb('mapping').notNull().default({}),
  staleAfterDays: integer('stale_after_days').notNull().default(90),
  refreshIntervalHours: integer('refresh_interval_hours').notNull().default(24),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  lastError: text('last_error'),
})

export const importRuns = pgTable(
  'import_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    layerKey: text('layer_key', { enum: LAYER_KEYS }).notNull(),
    adapter: text('adapter').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorJob: text('actor_job'),
    inputHash: text('input_hash').notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'failed'] }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    report: jsonb('report'),
    error: text('error'),
  },
  (t) => [index('import_runs_layer_idx').on(t.layerKey, t.startedAt)],
)

export const importExceptions = pgTable(
  'import_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    layerKey: text('layer_key', { enum: LAYER_KEYS }).notNull(),
    firstRunId: uuid('first_run_id')
      .notNull()
      .references(() => importRuns.id),
    lastSeenRunId: uuid('last_seen_run_id')
      .notNull()
      .references(() => importRuns.id),
    rowKey: text('row_key').notNull(),
    kind: text('kind', { enum: IMPORT_EXCEPTION_KINDS }).notNull(),
    contentHash: text('content_hash').notNull(),
    payload: jsonb('payload').notNull(),
    detail: text('detail').notNull(),
    status: text('status', {
      enum: ['open', 'accepted', 'dismissed', 'resolved_by_rerun'],
    })
      .notNull()
      .default('open'),
    dispositionBy: uuid('disposition_by'),
    dispositionReason: text('disposition_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('import_exceptions_open_unique')
      .on(t.layerKey, t.rowKey, t.kind, t.contentHash)
      .where(sql`${t.status} = 'open'`),
    index('import_exceptions_status_idx').on(t.layerKey, t.status),
  ],
)

export const gisFeatures = pgTable(
  'gis_features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    layerKey: text('layer_key', { enum: LAYER_KEYS }).notNull(),
    sourceKey: text('source_key').notNull(),
    name: text('name'),
    geom: geometryColumn('geom', { type: 'Geometry', srid: 4326 }).notNull(),
  },
  (t) => [
    unique('gis_features_source_unique').on(t.layerKey, t.sourceKey),
    index('gis_features_geom_gist').using('gist', t.geom),
  ],
)
