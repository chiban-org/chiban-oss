import { date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { enforcementOrders } from './enforcementOrders'

export const COURT_STEP_KINDS = ['filed_with_clerk', 'motion_to_enforce', 'judgment'] as const
export const JUDGMENT_OUTCOMES = ['affirmed', 'modified', 'annulled'] as const

export const orderCourtSteps = pgTable(
  'order_court_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => enforcementOrders.id),
    kind: text('kind', { enum: COURT_STEP_KINDS }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    court: text('court').notNull(),
    docket: text('docket'),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    judgmentOutcome: text('judgment_outcome', { enum: JUDGMENT_OUTCOMES }),
    appealDue: jsonb('appeal_due'),
    recordedBy: uuid('recorded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_court_steps_order_idx').on(t.orderId)],
)
