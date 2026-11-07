import { BOARD_KINDS } from '@packs/nh/boardKinds'
import { sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: BOARD_KINDS }).notNull(),
    name: text('name').notNull(),
    shortName: text('short_name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('boards_one_active_unique_kind_idx')
      .on(t.kind)
      .where(sql`${t.archivedAt} is null and ${t.kind} in ('planning_board', 'zba')`),
  ],
)

export type BoardRow = typeof boards.$inferSelect

export const boardMeetings = pgTable(
  'board_meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id),
    meetingDate: date('meeting_date', { mode: 'string' }).notNull(),
    kind: text('kind', { enum: ['regular', 'special'] }).notNull(),
    status: text('status', { enum: ['scheduled', 'cancelled'] })
      .notNull()
      .default('scheduled'),
    location: text('location').notNull().default(''),
    startsAtMinute: integer('starts_at_minute').notNull().default(1140),
    cancelReason: text('cancel_reason'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('board_meetings_scheduled_idx')
      .on(t.boardId, t.meetingDate, t.kind)
      .where(sql`${t.status} = 'scheduled'`),
  ],
)

export const acceptanceSchedules = pgTable('acceptance_schedules', {
  applicationId: uuid('application_id')
    .primaryKey()
    .references(() => applications.id),
  meetingId: uuid('meeting_id')
    .notNull()
    .references(() => boardMeetings.id),
  setBy: uuid('set_by').notNull(),
  setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
})

export const completenessVotes = pgTable(
  'completeness_votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => boardMeetings.id),
    votedOn: date('voted_on', { mode: 'string' }).notNull(),
    outcome: text('outcome', { enum: ['accepted', 'not_accepted'] }).notNull(),
    reason: text('reason'),
    recordedBy: uuid('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('completeness_votes_application_idx').on(t.applicationId)],
)

export const selectmenCertifications = pgTable(
  'selectmen_certifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    requestedOn: date('requested_on', { mode: 'string' }).notNull(),
    outcome: text('outcome', { enum: ['pending', 'certified', 'refused'] }).notNull(),
    decidedOn: date('decided_on', { mode: 'string' }),
    recordedBy: uuid('recorded_by').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('selectmen_certifications_application_idx').on(t.applicationId)],
)
