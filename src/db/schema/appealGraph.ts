import { boolean, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { boardDecisions } from './decisions'
import { applications } from './projects'

export const appealNodes = pgTable(
  'appeal_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', {
      enum: [
        'administrative_decision',
        'zba_decision',
        'pb_decision',
        'zba_appeal',
        'rehearing_motion',
        'rehearing_outcome',
        'court_petition',
      ],
    }).notNull(),
    applicationId: uuid('application_id').references(() => applications.id),
    decisionId: uuid('decision_id').references(() => boardDecisions.id),
    parentId: uuid('parent_id'),
    linkedPbNodeId: uuid('linked_pb_node_id'),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    outcome: text('outcome'),
    status: text('status', { enum: ['open', 'resolved', 'withdrawn', 'stayed'] })
      .notNull()
      .default('open'),
    untimely: boolean('untimely').notNull().default(false),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appeal_nodes_application_idx').on(t.applicationId),
    index('appeal_nodes_parent_idx').on(t.parentId),
  ],
)
