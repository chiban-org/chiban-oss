import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { citext } from './identity'
import { parcels } from './parcels'

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parcelId: uuid('parcel_id')
      .notNull()
      .references(() => parcels.id),
    title: text('title').notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('projects_parcel_idx').on(t.parcelId)],
)

export const projectParties = pgTable(
  'project_parties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    userId: uuid('user_id'),
    email: citext('email'),
    name: text('name').notNull(),
    role: text('role', { enum: ['owner', 'agent', 'contractor', 'applicant'] }).notNull(),
    ownerAuthorizationOnFile: boolean('owner_authorization_on_file').notNull().default(false),
    addedBy: uuid('added_by').notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    index('project_parties_project_idx').on(t.projectId),
    index('project_parties_user_idx').on(t.userId),
  ],
)

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seq: bigserial('seq', { mode: 'number' }).notNull().unique(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    number: text('number').notNull().unique(),
    applicationTypeKey: text('application_type_key').notNull(),
    configPins: jsonb('config_pins').notNull(),
    state: text('state').notNull().default('draft'),
    substep: text('substep'),
    rowVersion: integer('row_version').notNull().default(1),
    values: jsonb('values').notNull().default({}),
    facts: jsonb('facts').notNull().default({}),
    receivedDate: date('received_date', { mode: 'string' }),
    completedDate: date('completed_date', { mode: 'string' }),
    decidedOn: date('decided_on', { mode: 'string' }),
    issuedOn: date('issued_on', { mode: 'string' }),
    closureReason: text('closure_reason'),
    permitRevision: integer('permit_revision').notNull().default(0),
    permitCorrectedOn: date('permit_corrected_on', { mode: 'string' }),
    responsibleUserId: uuid('responsible_user_id'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('applications_project_idx').on(t.projectId),
    index('applications_state_idx').on(t.state),
    index('applications_responsible_idx').on(t.responsibleUserId),
  ],
)

export const applicationNumberCounters = pgTable(
  'application_number_counters',
  {
    prefix: text('prefix').notNull(),
    year: integer('year').notNull(),
    last: integer('last').notNull(),
  },
  (t) => [primaryKey({ columns: [t.prefix, t.year] })],
)

export const attestations = pgTable('attestations', {
  id: uuid('id').primaryKey().defaultRandom(),
  applicationId: uuid('application_id')
    .notNull()
    .references(() => applications.id),
  userId: uuid('user_id').notNull(),
  statementText: text('statement_text').notNull(),
  statementSha256: text('statement_sha256').notNull(),
  attestedAt: timestamp('attested_at', { withTimezone: true }).notNull().defaultNow(),
})
