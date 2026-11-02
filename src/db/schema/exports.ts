import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const EXPORT_KINDS = ['business', 'incremental', 'recovery'] as const
export const EXPORT_STATUSES = ['queued', 'running', 'ready', 'failed', 'expired'] as const

export const exportsTable = pgTable(
  'exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: EXPORT_KINDS }).notNull(),
    status: text('status', { enum: EXPORT_STATUSES }).notNull().default('queued'),
    targetId: uuid('target_id'),
    baseExportId: uuid('base_export_id'),
    storageKey: text('storage_key'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    manifest: jsonb('manifest'),
    manifestSha256: text('manifest_sha256'),
    requestedBy: uuid('requested_by'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [index('exports_status_idx').on(t.status)],
)

export type ExportRow = typeof exportsTable.$inferSelect
