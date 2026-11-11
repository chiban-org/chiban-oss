import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const ALERT_KINDS = [
  'disk_warning',
  'disk_critical',
  'job_stale',
  'schedule_missing',
  'backup_overdue',
  'backup_failed',
] as const
export const ALERT_SEVERITIES = ['warning', 'critical'] as const
export const ALERT_CHANNEL_KINDS = ['email', 'pager'] as const

export const healthAlerts = pgTable('health_alerts', {
  key: text('key').primaryKey(),
  kind: text('kind', { enum: ALERT_KINDS }).notNull(),
  severity: text('severity', { enum: ALERT_SEVERITIES }).notNull(),
  state: text('state', { enum: ['firing', 'resolved'] }).notNull(),
  summary: text('summary').notNull(),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
})

export const alertTests = pgTable('alert_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  channel: text('channel', { enum: ALERT_CHANNEL_KINDS }).notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdByKind: text('created_by_kind').notNull(),
})

export const workerState = pgTable('worker_state', {
  id: integer('id').primaryKey().default(1),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
})
