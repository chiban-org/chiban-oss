import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { documents, documentVersions } from './documents'
import { rtkRequests } from './rightToKnow'

export const REDACTION_PURPOSES = ['public', 'rtk_release'] as const
export type RedactionPurpose = (typeof REDACTION_PURPOSES)[number]

export interface StoredPdfBox {
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface StoredImageBox {
  x: number
  y: number
  width: number
  height: number
}

export const redactionJobs = pgTable(
  'redaction_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id),
    sourceVersionId: uuid('source_version_id')
      .notNull()
      .references(() => documentVersions.id),
    purpose: text('purpose', { enum: REDACTION_PURPOSES }).notNull(),
    rtkRequestId: uuid('rtk_request_id').references(() => rtkRequests.id),
    status: text('status', { enum: ['queued', 'complete', 'failed'] })
      .notNull()
      .default('queued'),
    failureReason: text('failure_reason'),
    resultVersionId: uuid('result_version_id').references((): AnyPgColumn => documentVersions.id),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('redaction_jobs_document_idx').on(t.documentId),
    index('redaction_jobs_status_idx').on(t.status, t.createdAt),
  ],
)

export const redactionBoxes = pgTable(
  'redaction_boxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => redactionJobs.id),
    page: integer('page'),
    pdfBox: jsonb('pdf_box').$type<StoredPdfBox>(),
    imageBox: jsonb('image_box').$type<StoredImageBox>(),
    exemptionKey: text('exemption_key').notNull(),
    otherCitation: text('other_citation'),
    explanation: text('explanation').notNull(),
  },
  (t) => [index('redaction_boxes_job_idx').on(t.jobId)],
)
