import { sql } from 'drizzle-orm'
import { bigint, check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { exportTargets } from './exportTargets'

export const BACKUP_FREQUENCIES = ['daily', 'weekly'] as const
export const BACKUP_PROBLEM_KINDS = ['failed', 'skipped'] as const

export const backupSchedule = pgTable(
  'backup_schedule',
  {
    id: integer('id').primaryKey().default(1),
    targetId: uuid('target_id').references(() => exportTargets.id, { onDelete: 'set null' }),
    frequency: text('frequency', { enum: BACKUP_FREQUENCIES }).notNull().default('daily'),
    startHour: integer('start_hour').notNull().default(1),
    keepCount: integer('keep_count').notNull().default(14),
    scheduledSince: timestamp('scheduled_since', { withTimezone: true }),
    nextDueAt: timestamp('next_due_at', { withTimezone: true }),
    runRequestedAt: timestamp('run_requested_at', { withTimezone: true }),
    lastStartedAt: timestamp('last_started_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastSuccessPath: text('last_success_path'),
    lastSuccessBytes: bigint('last_success_bytes', { mode: 'number' }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    lastFailureKind: text('last_failure_kind', { enum: BACKUP_PROBLEM_KINDS }),
    lastError: text('last_error'),
    lastPruneError: text('last_prune_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('backup_schedule_single_row', sql`${t.id} = 1`),
    check('backup_schedule_start_hour', sql`${t.startHour} between 0 and 23`),
    check('backup_schedule_keep_count', sql`${t.keepCount} between 1 and 365`),
  ],
)

export type BackupScheduleRow = typeof backupSchedule.$inferSelect
