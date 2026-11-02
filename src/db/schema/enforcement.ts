import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { citext } from './identity'
import { parcels } from './parcels'

export const ENFORCEMENT_STATUSES = [
  'intake',
  'investigating',
  'violation_found',
  'no_violation',
  'order_issued',
  'in_court',
  'resolved',
  'closed',
] as const
export type EnforcementStatus = (typeof ENFORCEMENT_STATUSES)[number]

export const COMPLAINT_CHANNELS = ['anonymous_web', 'public_named', 'staff_entry'] as const
export type ComplaintChannel = (typeof COMPLAINT_CHANNELS)[number]

export const enforcementCases = pgTable(
  'enforcement_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    parcelId: uuid('parcel_id').references(() => parcels.id),
    locationText: text('location_text').notNull(),
    status: text('status', { enum: ENFORCEMENT_STATUSES }).notNull().default('intake'),
    openedOn: date('opened_on', { mode: 'string' }).notNull(),
    closedOn: date('closed_on', { mode: 'string' }),
    closureReason: text('closure_reason'),
    assignedTo: uuid('assigned_to'),
    isPublic: boolean('is_public').notNull().default(false),
    publicSummary: text('public_summary'),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('enforcement_cases_status_idx').on(t.status),
    index('enforcement_cases_parcel_idx').on(t.parcelId),
    check(
      'enforcement_cases_public_summary_check',
      sql`${t.isPublic} = false or ${t.publicSummary} is not null`,
    ),
  ],
)

export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    caseId: uuid('case_id').references(() => enforcementCases.id),
    channel: text('channel', { enum: COMPLAINT_CHANNELS }).notNull(),
    receivedOn: date('received_on', { mode: 'string' }).notNull(),
    locationText: text('location_text').notNull(),
    parcelId: uuid('parcel_id').references(() => parcels.id),
    descriptionOriginal: text('description_original').notNull(),
    descriptionPublic: text('description_public'),
    publicTextApprovedBy: uuid('public_text_approved_by'),
    publicTextApprovedAt: timestamp('public_text_approved_at', { withTimezone: true }),
    complainantName: text('complainant_name'),
    complainantEmail: citext('complainant_email'),
    complainantPhone: text('complainant_phone'),
    createdBy: uuid('created_by'),
    isProbe: boolean('is_probe').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('complaints_case_idx').on(t.caseId),
    check(
      'complaints_anonymous_has_no_identity',
      sql`${t.channel} <> 'anonymous_web' or (${t.complainantName} is null and ${t.complainantEmail} is null and ${t.complainantPhone} is null and ${t.createdBy} is null)`,
    ),
  ],
)

export const enforcementNotes = pgTable(
  'enforcement_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => enforcementCases.id),
    observedOn: date('observed_on', { mode: 'string' }).notNull(),
    body: text('body').notNull(),
    authorId: uuid('author_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('enforcement_notes_case_idx').on(t.caseId)],
)

export type EnforcementCaseRow = typeof enforcementCases.$inferSelect
export type ComplaintRow = typeof complaints.$inferSelect
