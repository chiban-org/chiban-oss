import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applicationDocumentItems,
  applicationDocumentLinks,
  type applications,
  documents,
} from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { type ItemRecord, itemStatus } from '@/features/applications/documentChecklist'
import {
  type DocumentItem,
  type DocumentStage,
  documentItemsOf,
} from '@/features/applications/documentItemSchema'
import type { CoreState } from '@/features/applications/states'
import type { ConfigPins } from '@/features/config/bindings'
import { getVersion } from '@/features/config/store'
import type { FieldValue } from '@/features/forms/validateSubmission'

const REQUESTED_STAGE: Partial<Record<CoreState, DocumentStage>> = {
  draft: 'to_file',
  submitted: 'to_file',
  under_review: 'before_decision',
  decided: 'before_issue',
  issued: 'before_co',
}

type ApplicationRow = typeof applications.$inferSelect

interface Candidate {
  applicationId: string
  values: Record<string, FieldValue>
  items: DocumentItem[]
}

async function candidatesOf(
  db: DbOrTx,
  apps: readonly ApplicationRow[],
  signal: AbortSignal,
): Promise<Candidate[]> {
  const bodies = new Map<string, DocumentItem[]>()
  const out: Candidate[] = []
  for (const app of apps) {
    const stage = REQUESTED_STAGE[app.state as CoreState]
    if (stage === undefined) continue
    const versionId = (app.configPins as ConfigPins).applicationType
    if (!bodies.has(versionId)) {
      const version = await getVersion(db, versionId, signal)
      bodies.set(
        versionId,
        version === null ? [] : documentItemsOf(version.body as ApplicationTypeBody),
      )
    }
    const items = (bodies.get(versionId) ?? []).filter((item) => item.stage === stage)
    if (items.length > 0)
      out.push({ applicationId: app.id, values: app.values as Record<string, FieldValue>, items })
  }
  return out
}

async function recordsOf(db: DbOrTx, applicationIds: string[]): Promise<Map<string, ItemRecord>> {
  const [links, rows] = await Promise.all([
    db
      .select({
        applicationId: applicationDocumentLinks.applicationId,
        itemKey: applicationDocumentLinks.itemKey,
        documentId: documents.id,
      })
      .from(applicationDocumentLinks)
      .innerJoin(documents, eq(documents.id, applicationDocumentLinks.documentId))
      .where(
        and(
          inArray(applicationDocumentLinks.applicationId, applicationIds),
          isNull(documents.disposedAt),
        ),
      ),
    db
      .select()
      .from(applicationDocumentItems)
      .where(inArray(applicationDocumentItems.applicationId, applicationIds)),
  ])
  const records = new Map<
    string,
    { documentIds: string[]; waiverRequested: boolean; accepted: boolean }
  >()
  const recordFor = (applicationId: string, itemKey: string) => {
    const key = `${applicationId}|${itemKey}`
    const held = records.get(key)
    if (held !== undefined) return held
    const made = { documentIds: [], waiverRequested: false, accepted: false }
    records.set(key, made)
    return made
  }
  for (const link of links)
    recordFor(link.applicationId, link.itemKey).documentIds.push(link.documentId)
  for (const row of rows) {
    const record = recordFor(row.applicationId, row.itemKey)
    record.waiverRequested = row.waiverRequestedAt !== null
    record.accepted = row.acceptedAt !== null
  }
  return records
}

export async function missingDocumentsFor(
  db: DbOrTx,
  apps: readonly ApplicationRow[],
  signal: AbortSignal,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const candidates = await candidatesOf(db, apps, signal)
  if (candidates.length === 0) return out
  const records = await recordsOf(
    db,
    candidates.map((c) => c.applicationId),
  )
  for (const candidate of candidates) {
    const missing = candidate.items
      .filter(
        (item) =>
          itemStatus(
            item,
            candidate.values,
            records.get(`${candidate.applicationId}|${item.key}`),
          ) === 'missing',
      )
      .map((item) => item.label.replace(/\.+$/, ''))
    if (missing.length > 0) out.set(candidate.applicationId, missing)
  }
  return out
}
