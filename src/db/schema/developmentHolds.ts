import { sql } from 'drizzle-orm'
import {
  date,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { enforcementCases } from './enforcement'
import { parcels } from './parcels'
import { applications } from './projects'

export const HOLD_PERMIT_ACTIONS = ['suspended', 'revoked'] as const
export type HoldPermitAction = (typeof HOLD_PERMIT_ACTIONS)[number]

export const developmentHolds = pgTable(
  'development_holds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    placedOn: date('placed_on', { mode: 'string' }).notNull(),
    placedBy: uuid('placed_by').notNull(),
    releasedOn: date('released_on', { mode: 'string' }),
    releasedBy: uuid('released_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('development_holds_case_idx').on(t.caseId),
    uniqueIndex('development_holds_active_parcel_idx')
      .on(t.parcelId)
      .where(sql`${t.releasedOn} is null`),
  ],
)

export const holdPermitActions = pgTable(
  'hold_permit_actions',
  {
    holdId: uuid('hold_id')
      .notNull()
      .references(() => developmentHolds.id),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    action: text('action', { enum: HOLD_PERMIT_ACTIONS }).notNull(),
    actedOn: date('acted_on', { mode: 'string' }).notNull(),
    actedBy: uuid('acted_by').notNull(),
    reinstatedOn: date('reinstated_on', { mode: 'string' }),
  },
  (t) => [
    primaryKey({ columns: [t.holdId, t.applicationId] }),
    index('hold_permit_actions_application_idx').on(t.applicationId),
  ],
)

export const enforcementCivilActions = pgTable(
  'enforcement_civil_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    filedOn: date('filed_on', { mode: 'string' }).notNull(),
    court: text('court').notNull(),
    docket: text('docket'),
    recordedBy: uuid('recorded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('enforcement_civil_actions_case_idx').on(t.caseId)],
)
