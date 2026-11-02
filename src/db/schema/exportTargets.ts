import { sql } from 'drizzle-orm'
import { boolean, check, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const EXPORT_TARGET_KINDS = ['local_fs', 's3', 'onedrive'] as const

export const exportTargets = pgTable(
  'export_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: EXPORT_TARGET_KINDS }).notNull(),
    name: text('name').notNull(),
    settings: jsonb('settings').notNull(),
    credentialsEnc: text('credentials_enc'),
    dayOfMonth: integer('day_of_month').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    runRequestedAt: timestamp('run_requested_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('export_targets_day_of_month_check', sql`${t.dayOfMonth} between 1 and 28`)],
)

export type ExportTargetRow = typeof exportTargets.$inferSelect
