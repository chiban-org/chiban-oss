import { sql } from 'drizzle-orm'
import { date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import { documents } from './documents'
import { enforcementCases } from './enforcement'

export const CURE_RECIPIENT_ROLES = ['owner', 'occupant'] as const
export type CureRecipientRole = (typeof CURE_RECIPIENT_ROLES)[number]

export const cureNotices = pgTable(
  'cure_notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    findingIds: uuid('finding_ids').array().notNull().default(sql`'{}'::uuid[]`),
    recipientRole: text('recipient_role', { enum: CURE_RECIPIENT_ROLES }).notNull(),
    recipientName: text('recipient_name').notNull(),
    mailingAddress: text('mailing_address').notNull(),
    sentOn: date('sent_on', { mode: 'string' }).notNull(),
    returnReceiptOn: date('return_receipt_on', { mode: 'string' }),
    documentId: uuid('document_id').references(() => documents.id),
    cureDue: jsonb('cure_due').$type<SubjectDue>().notNull(),
    sentBy: uuid('sent_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cure_notices_case_idx').on(t.caseId)],
)
