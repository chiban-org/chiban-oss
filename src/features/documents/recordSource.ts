import { and, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents } from '@/db/schema'
import { documentVisibleTo } from '@/features/documents/visibility'
import {
  type ParcelRecordSummary,
  registerParcelRecordSource,
  type Viewer,
} from '@/features/parcels/recordSources'
import { getTownSettings } from '@/features/town/settings'
import { todayInTimeZone } from '@/types/civilDate'

const FALLBACK_ZONE = 'America/New_York'

const KIND_LABEL = {
  attachment: 'Attachment',
  parcel_file: 'Parcel file',
  application_snapshot: 'Application snapshot',
  issued_permit: 'Issued permit',
  board_material: 'Board material',
  inspection_photo: 'Inspection photo',
  certificate_of_occupancy: 'Certificate of occupancy',
  notice_proof: 'Proof of notice',
  enforcement_photo: 'Case photo',
  enforcement_letter: 'Case letter',
  service_proof: 'Proof of service',
  court_document: 'Court document',
  rtk_letter: 'Right-to-Know letter',
} as const

export async function summarizeDocuments(
  db: DbOrTx,
  ids: string[],
  viewer: Viewer,
  signal: AbortSignal,
): Promise<ParcelRecordSummary[]> {
  const actor = viewer.kind === 'actor' ? viewer.actor : null
  const rows = await db
    .select()
    .from(documents)
    .where(and(inArray(documents.id, ids), documentVisibleTo(actor)))
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : FALLBACK_ZONE
  return rows.map((row) => ({
    kind: 'document',
    recordId: row.id,
    title: row.title,
    number: KIND_LABEL[row.docKind],
    status: { label: row.isPublic ? 'Public' : 'Private', chip: 'neutral' },
    date: todayInTimeZone(zone, row.createdAt),
    href: `/api/documents/${row.id}`,
    thumbnailHref: `/api/documents/${row.id}/thumbnail`,
    parcelFile: row.docKind === 'parcel_file',
  }))
}

export function registerDocumentRecordSource(): void {
  registerParcelRecordSource({ kind: 'document', summarize: summarizeDocuments })
}

registerDocumentRecordSource()
