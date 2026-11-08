import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { citext } from './identity'
import { applications, projectParties, projects } from './projects'

export const contractorClaims = pgTable(
  'contractor_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    partyId: uuid('party_id')
      .notNull()
      .references(() => projectParties.id),
    email: citext('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    applicationId: uuid('application_id').references(() => applications.id),
    sentBy: uuid('sent_by'),
    sentByKind: text('sent_by_kind', { enum: ['staff', 'applicant', 'system'] }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedBy: uuid('claimed_by'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('contractor_claims_project_idx').on(t.projectId, t.createdAt)],
)
