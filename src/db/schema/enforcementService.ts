import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { documents } from './documents'
import { enforcementOrders } from './enforcementOrders'

export const RECIPIENT_ROLE_VALUES = [
  'record_owner',
  'owner_agent',
  'taxpayer',
  'occupying_tenant',
  'person_in_control',
  'mortgagee_of_record',
] as const

export const SERVICE_METHODS = [
  'in_hand',
  'abode',
  'other_civil_summons_method',
  'posting_on_property',
  'newspaper_publication',
] as const

export const SERVER_ROLES = [
  'sheriff',
  'deputy_sheriff',
  'local_police_officer',
  'constable',
  'other',
] as const

export const orderServiceRecipients = pgTable(
  'order_service_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => enforcementOrders.id),
    role: text('role', { enum: RECIPIENT_ROLE_VALUES }).notNull(),
    name: text('name').notNull(),
    address: text('address').notNull(),
    source: text('source').notNull(),
    answerDue: jsonb('answer_due'),
    answeredOn: date('answered_on', { mode: 'string' }),
    answerDocumentId: uuid('answer_document_id').references(() => documents.id),
  },
  (t) => [index('order_service_recipients_order_idx').on(t.orderId)],
)

export const orderServiceRoleChecks = pgTable(
  'order_service_role_checks',
  {
    orderId: uuid('order_id')
      .notNull()
      .references(() => enforcementOrders.id),
    role: text('role', { enum: RECIPIENT_ROLE_VALUES }).notNull(),
    outcome: text('outcome', {
      enum: ['recipients_listed', 'none_exist', 'same_as_owner', 'owner_not_found'],
    }).notNull(),
    basis: text('basis').notNull(),
    checkedBy: uuid('checked_by').notNull(),
    checkedOn: date('checked_on', { mode: 'string' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.role] }),
    check(
      'order_service_role_checks_same_as_owner',
      sql`${t.outcome} <> 'same_as_owner' or ${t.role} = 'taxpayer'`,
    ),
    check(
      'order_service_role_checks_owner_not_found',
      sql`${t.outcome} <> 'owner_not_found' or ${t.role} = 'record_owner'`,
    ),
  ],
)

export const orderServiceEvents = pgTable(
  'order_service_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => enforcementOrders.id),
    recipientId: uuid('recipient_id').references(() => orderServiceRecipients.id),
    method: text('method', { enum: SERVICE_METHODS }).notNull(),
    servedOn: date('served_on', { mode: 'string' }).notNull(),
    serverName: text('server_name'),
    serverRole: text('server_role', { enum: SERVER_ROLES }),
    newspaper: text('newspaper'),
    proofDocumentId: uuid('proof_document_id')
      .notNull()
      .references(() => documents.id),
    recordedBy: uuid('recorded_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('order_service_events_order_idx').on(t.orderId),
    check(
      'order_service_events_recipient_rule',
      sql`(${t.method} in ('posting_on_property', 'newspaper_publication')) = (${t.recipientId} is null)`,
    ),
    check(
      'order_service_events_server_rule',
      sql`${t.method} not in ('in_hand', 'abode') or (${t.serverName} is not null and ${t.serverRole} is not null)`,
    ),
  ],
)
