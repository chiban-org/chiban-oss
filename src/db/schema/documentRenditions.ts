import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { documentVersions } from './documents'

export const RENDITION_KINDS = ['thumbnail', 'preview'] as const
export type RenditionKind = (typeof RENDITION_KINDS)[number]

export const documentRenditions = pgTable(
  'document_renditions',
  {
    versionId: uuid('version_id')
      .notNull()
      .references(() => documentVersions.id),
    kind: text('kind', { enum: RENDITION_KINDS }).notNull(),
    page: integer('page').notNull(),
    storageKey: text('storage_key').notNull(),
    width: integer('width').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.kind, t.page] })],
)
