import { boolean, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { boardMeetings } from './boards'
import { noticeSets } from './notices'
import { applications } from './projects'

export const hearings = pgTable(
  'hearings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => boardMeetings.id),
    kind: text('kind', {
      enum: ['submission_and_hearing', 'public_hearing', 'rehearing'],
    }).notNull(),
    status: text('status', { enum: ['scheduled', 'held', 'continued', 'cancelled'] })
      .notNull()
      .default('scheduled'),
    continuedFrom: uuid('continued_from'),
    continuationAnnounced: boolean('continuation_announced'),
    announcedDetails: text('announced_details'),
    noticeSetId: uuid('notice_set_id')
      .notNull()
      .references(() => noticeSets.id),
    properlyNoticedAt: timestamp('properly_noticed_at', { withTimezone: true }),
    properlyNoticedBy: uuid('properly_noticed_by'),
    heldOn: date('held_on', { mode: 'string' }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('hearings_application_idx').on(t.applicationId),
    index('hearings_meeting_idx').on(t.meetingId),
  ],
)
