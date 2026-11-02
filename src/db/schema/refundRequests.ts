import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { ledgerEntries } from './ledger'

export const refundRequests = pgTable('refund_requests', {
  refundObjectId: text('refund_object_id').primaryKey(),
  entryId: uuid('entry_id')
    .notNull()
    .references(() => ledgerEntries.id),
  allocations: jsonb('allocations').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
