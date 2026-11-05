import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const applicationSnapshots = pgTable(
  'application_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    sequence: integer('sequence').notNull(),
    reason: text('reason', { enum: ['submission', 'amendment', 'correction'] }).notNull(),
    body: jsonb('body').notNull(),
    bodySha256: text('body_sha256').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('application_snapshots_sequence_uq').on(t.applicationId, t.sequence),
    index('application_snapshots_application_idx').on(t.applicationId),
    check(
      'application_snapshots_reason_check',
      sql`${t.reason} in ('submission', 'amendment', 'correction')`,
    ),
  ],
)

export type ApplicationSnapshotRow = typeof applicationSnapshots.$inferSelect
