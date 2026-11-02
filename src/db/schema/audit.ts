import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorKind: text('actor_kind').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorJob: text('actor_job'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
  },
  (t) => [index('audit_log_entity_idx').on(t.entityType, t.entityId)],
)
