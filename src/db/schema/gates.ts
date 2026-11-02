import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const gateOverrides = pgTable(
  'gate_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    gateKey: text('gate_key').notNull(),
    kind: text('kind', { enum: ['administrative_override', 'statutory_exception'] }).notNull(),
    reason: text('reason'),
    legalAuthority: jsonb('legal_authority'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: uuid('revoked_by'),
  },
  (t) => [index('gate_overrides_application_idx').on(t.applicationId)],
)
