import { sql } from 'drizzle-orm'
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const configVersions = pgTable(
  'config_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    status: text('status', { enum: ['draft', 'published', 'superseded'] }).notNull(),
    body: jsonb('body').notNull(),
    upstreamTemplateId: text('upstream_template_id'),
    upstreamTemplateVersion: integer('upstream_template_version'),
    rolledBackFrom: integer('rolled_back_from'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid('published_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('config_versions_kind_key_version_uq').on(t.kind, t.key, t.version),
    uniqueIndex('config_versions_one_published_uq')
      .on(t.kind, t.key)
      .where(sql`${t.status} = 'published'`),
  ],
)
