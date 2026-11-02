import { date, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const regionalImpactDeterminations = pgTable('regional_impact_determinations', {
  applicationId: uuid('application_id')
    .primaryKey()
    .references(() => applications.id),
  determination: text('determination', { enum: ['yes', 'no', 'previously_determined'] }).notNull(),
  previousBoardRef: text('previous_board_ref'),
  determinedOn: date('determined_on', { mode: 'string' }).notNull(),
  determinedBy: uuid('determined_by').notNull(),
})

export const regionalImpactNotices = pgTable(
  'regional_impact_notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    recipientKind: text('recipient_kind', {
      enum: ['governing_body', 'regional_planning_commission', 'affected_municipality'],
    }).notNull(),
    recipientName: text('recipient_name').notNull(),
    method: text('method', {
      enum: ['certified_mail', 'hand_delivery', 'email', 'other'],
    }).notNull(),
    mailedOn: date('mailed_on', { mode: 'string' }).notNull(),
    reference: text('reference'),
    recordedBy: uuid('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('regional_impact_notices_application_idx').on(t.applicationId)],
)

export const regionalImpactParties = pgTable(
  'regional_impact_parties',
  {
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    municipalityKey: text('municipality_key').notNull(),
  },
  (t) => [primaryKey({ columns: [t.applicationId, t.municipalityKey] })],
)
