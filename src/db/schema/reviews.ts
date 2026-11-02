import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { applications } from './projects'

export const reviewAssignments = pgTable(
  'review_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    reviewerUserId: uuid('reviewer_user_id').notNull(),
    assignedBy: uuid('assigned_by').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    status: text('status', { enum: ['pending', 'commented', 'signed_off'] })
      .notNull()
      .default('pending'),
    signedOffAt: timestamp('signed_off_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('review_assignments_active_idx')
      .on(t.applicationId, t.reviewerUserId)
      .where(sql`${t.removedAt} is null`),
    index('review_assignments_reviewer_idx').on(t.reviewerUserId),
  ],
)

export const reviewComments = pgTable('review_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => reviewAssignments.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
