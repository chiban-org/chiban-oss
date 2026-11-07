import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { boards } from './boards'
import { applications } from './projects'

export const reviewAssignments = pgTable(
  'review_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id),
    reviewerUserId: uuid('reviewer_user_id'),
    boardId: uuid('board_id').references(() => boards.id),
    commentBy: date('comment_by', { mode: 'string' }),
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
    uniqueIndex('review_assignments_active_board_idx')
      .on(t.applicationId, t.boardId)
      .where(sql`${t.removedAt} is null and ${t.boardId} is not null`),
    index('review_assignments_reviewer_idx').on(t.reviewerUserId),
    index('review_assignments_board_idx').on(t.boardId),
    check(
      'review_assignments_one_assignee',
      sql`num_nonnulls(${t.reviewerUserId}, ${t.boardId}) = 1`,
    ),
    check(
      'review_assignments_board_comment_by',
      sql`${t.commentBy} is null or ${t.boardId} is not null`,
    ),
    check(
      'review_assignments_board_no_sign_off',
      sql`${t.boardId} is null or ${t.status} <> 'signed_off'`,
    ),
  ],
)

export const reviewComments = pgTable('review_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id')
    .notNull()
    .references(() => reviewAssignments.id),
  authorUserId: uuid('author_user_id'),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
