import { date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { applications } from './projects'

export const decisionNotices = pgTable('decision_notices', {
  applicationId: uuid('application_id')
    .primaryKey()
    .references(() => applications.id),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id),
  mailedOn: date('mailed_on', { mode: 'string' }).notNull(),
  recordedBy: uuid('recorded_by').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
})

export const deemedRefusals = pgTable('deemed_refusals', {
  applicationId: uuid('application_id')
    .primaryKey()
    .references(() => applications.id),
  ruleKey: text('rule_key').notNull(),
  ruleVersion: integer('rule_version').notNull(),
  dueOn: date('due_on', { mode: 'string' }).notNull(),
  firedOn: date('fired_on', { mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
