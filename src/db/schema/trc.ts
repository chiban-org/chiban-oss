import { date, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'
import { reviewAssignments } from './reviews'

export const trcRoutings = pgTable(
  'trc_routings',
  {
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    departmentKey: text('department_key').notNull(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => reviewAssignments.id),
    commentDue: date('comment_due', { mode: 'string' }),
  },
  (t) => [primaryKey({ columns: [t.applicationId, t.departmentKey] })],
)
