import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  type ApplicationDocumentItemRow,
  applicationDocumentItems,
  applicationDocumentLinks,
  documents,
} from '@/db/schema'
import type { ItemRecord } from '@/features/applications/documentChecklist'

export interface StoredItemRecord extends ItemRecord {
  row: ApplicationDocumentItemRow | null
}

export async function loadItemRecords(
  db: DbOrTx,
  applicationId: string,
): Promise<Map<string, StoredItemRecord>> {
  const links = await db
    .select({ itemKey: applicationDocumentLinks.itemKey, documentId: documents.id })
    .from(applicationDocumentLinks)
    .innerJoin(documents, eq(documents.id, applicationDocumentLinks.documentId))
    .where(
      and(eq(applicationDocumentLinks.applicationId, applicationId), isNull(documents.disposedAt)),
    )
    .orderBy(applicationDocumentLinks.linkedAt)
  const rows = await db
    .select()
    .from(applicationDocumentItems)
    .where(eq(applicationDocumentItems.applicationId, applicationId))
  const out = new Map<string, StoredItemRecord>()
  const recordFor = (key: string): StoredItemRecord => {
    const found = out.get(key)
    if (found !== undefined) return found
    const made: StoredItemRecord = {
      documentIds: [],
      waiverRequested: false,
      accepted: false,
      row: null,
    }
    out.set(key, made)
    return made
  }
  for (const link of links) {
    const record = recordFor(link.itemKey)
    record.documentIds = [...record.documentIds, link.documentId]
  }
  for (const row of rows) {
    const record = recordFor(row.itemKey)
    record.row = row
    record.waiverRequested = row.waiverRequestedAt !== null
    record.accepted = row.acceptedAt !== null
  }
  return out
}
