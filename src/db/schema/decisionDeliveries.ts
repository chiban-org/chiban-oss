import { sql } from 'drizzle-orm'
import { check, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { appealNodes } from './appealGraph'
import { boardDecisions } from './decisions'
import { applications, projectParties } from './projects'

export const decisionDeliveries = pgTable(
  'decision_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    decisionId: uuid('decision_id').references(() => boardDecisions.id),
    appealNodeId: uuid('appeal_node_id').references(() => appealNodes.id),
    recipientRole: text('recipient_role', {
      enum: ['applicant', 'agent', 'planning_board', 'municipal_officers'],
    }).notNull(),
    partyId: uuid('party_id').references(() => projectParties.id),
    recipientName: text('recipient_name').notNull(),
    method: text('method', { enum: ['mail', 'hand'] }),
    deliveredOn: date('delivered_on', { mode: 'string' }),
    recordedBy: uuid('recorded_by'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }),
  },
  (t) => [
    index('decision_deliveries_application_idx').on(t.applicationId),
    index('decision_deliveries_decision_idx').on(t.decisionId),
    index('decision_deliveries_appeal_node_idx').on(t.appealNodeId),
    check(
      'decision_deliveries_one_source',
      sql`(${t.decisionId} is not null) <> (${t.appealNodeId} is not null)`,
    ),
  ],
)
