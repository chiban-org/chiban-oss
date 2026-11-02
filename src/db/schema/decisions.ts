import { date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { boardMeetings } from './boards'
import { hearings } from './hearings'
import { applications } from './projects'

export interface DecisionVotes {
  for: number
  against: number
  abstain: number
  members: { name: string; vote: 'for' | 'against' | 'abstain' | 'recused' }[]
}

export interface DecisionCondition {
  code: string
  text: string
  precedent: boolean
}

export const boardDecisions = pgTable(
  'board_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    hearingId: uuid('hearing_id')
      .notNull()
      .references(() => hearings.id),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => boardMeetings.id),
    votedOn: date('voted_on', { mode: 'string' }).notNull(),
    outcome: text('outcome', {
      enum: [
        'approved',
        'approved_with_conditions',
        'denied',
        'rehearing_granted',
        'rehearing_denied',
      ],
    }).notNull(),
    motion: text('motion').notNull(),
    votes: jsonb('votes').$type<DecisionVotes>().notNull(),
    findings: text('findings').notNull(),
    conditions: jsonb('conditions').$type<DecisionCondition[]>().notNull(),
    reasonsForDisapproval: text('reasons_for_disapproval'),
    filedOn: date('filed_on', { mode: 'string' }),
    minutesDocumentId: uuid('minutes_document_id'),
    writtenDecisionDocumentId: uuid('written_decision_document_id'),
    letterDocumentId: uuid('letter_document_id'),
    recordedBy: uuid('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('board_decisions_application_idx').on(t.applicationId)],
)
