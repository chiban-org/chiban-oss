import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applicationDocumentItems,
  applicationDocumentLinks,
  applications,
  configVersions,
  documents,
} from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import {
  type ItemRecord,
  itemStatus,
  stageOpenFor,
} from '@/features/applications/documentChecklist'
import { documentItemsOf } from '@/features/applications/documentItemSchema'
import type { CoreState } from '@/features/applications/states'
import type { ConfigPins } from '@/features/config/bindings'
import { missingNow } from '@/features/portal/applicantStatus'

type Records = Map<string, Map<string, ItemRecord>>

function recordIn(records: Records, applicationId: string, itemKey: string): ItemRecord {
  const byItem = records.get(applicationId) ?? new Map<string, ItemRecord>()
  records.set(applicationId, byItem)
  const found = byItem.get(itemKey) ?? { documentIds: [], waiverRequested: false, accepted: false }
  byItem.set(itemKey, found)
  return found
}

async function recordsFor(db: DbOrTx, ids: string[]): Promise<Records> {
  const [links, items] = await Promise.all([
    db
      .select({
        applicationId: applicationDocumentLinks.applicationId,
        itemKey: applicationDocumentLinks.itemKey,
        documentId: documents.id,
      })
      .from(applicationDocumentLinks)
      .innerJoin(documents, eq(documents.id, applicationDocumentLinks.documentId))
      .where(
        and(inArray(applicationDocumentLinks.applicationId, ids), isNull(documents.disposedAt)),
      ),
    db
      .select()
      .from(applicationDocumentItems)
      .where(inArray(applicationDocumentItems.applicationId, ids)),
  ])
  const records: Records = new Map()
  for (const link of links) {
    const record = recordIn(records, link.applicationId, link.itemKey)
    record.documentIds = [...record.documentIds, link.documentId]
  }
  for (const row of items) {
    const record = recordIn(records, row.applicationId, row.itemKey)
    record.waiverRequested = row.waiverRequestedAt !== null
    record.accepted = row.acceptedAt !== null
  }
  return records
}

export async function missingDocumentsByApplication(
  db: DbOrTx,
  ids: string[],
  signal: AbortSignal,
): Promise<Map<string, string[]>> {
  signal.throwIfAborted()
  if (ids.length === 0) return new Map()
  const apps = await db
    .select({
      id: applications.id,
      state: applications.state,
      values: applications.values,
      pins: applications.configPins,
    })
    .from(applications)
    .where(inArray(applications.id, ids))
  const typeIds = [...new Set(apps.map((a) => (a.pins as ConfigPins).applicationType))]
  const [types, records] = await Promise.all([
    db
      .select({ id: configVersions.id, body: configVersions.body })
      .from(configVersions)
      .where(inArray(configVersions.id, typeIds)),
    recordsFor(db, ids),
  ])
  const bodyOf = new Map(types.map((t) => [t.id, t.body as ApplicationTypeBody]))
  return new Map(
    apps.map((app) => {
      const state = app.state as CoreState
      const values = app.values as Record<string, unknown>
      const body = bodyOf.get((app.pins as ConfigPins).applicationType)
      const rows = documentItemsOf(body ?? {}).map((item) => ({
        label: item.label,
        stage: item.stage,
        status: itemStatus(item, values, records.get(app.id)?.get(item.key)),
        open: stageOpenFor(item.stage, state),
      }))
      return [app.id, missingNow(rows, state)]
    }),
  )
}
