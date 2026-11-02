import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const historicalRecords = pgTable(
  'historical_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recordType: text('record_type').notNull(),
    number: text('number'),
    recordedOn: date('recorded_on', { mode: 'string' }),
    description: text('description'),
    values: jsonb('values').$type<Record<string, string>>().notNull(),
    sourceFile: text('source_file').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    sourceSheet: text('source_sheet').notNull(),
    sourceRow: integer('source_row').notNull(),
    importedBy: uuid('imported_by').notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('historical_records_source_unique').on(t.sourceSha256, t.sourceSheet, t.sourceRow),
    index('historical_records_recorded_on_idx').on(t.recordedOn),
  ],
)
