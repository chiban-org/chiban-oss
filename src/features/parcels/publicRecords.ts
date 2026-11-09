import type { ParcelHistory } from '@/features/parcels/parcelHistory'
import {
  buildRecordTable,
  parcelFilesOf,
  type RecordFile,
  type RecordRow,
} from '@/features/parcels/recordTable'

export interface PublicRecordGroup {
  parcelId: string
  displayId: string
  label: string
  rows: RecordRow[]
  files: RecordFile[]
}

export interface PublicRecords {
  own: RecordRow[]
  files: RecordFile[]
  ancestral: PublicRecordGroup[]
}

export function buildPublicRecords(history: ParcelHistory, parcelId: string): PublicRecords {
  const table = buildRecordTable(history, parcelId)
  const rowsByParcel = new Map(table.ancestral.map((g) => [g.parcelId, g.rows]))
  return {
    own: table.own,
    files: parcelFilesOf(history.own, parcelId),
    ancestral: history.ancestral
      .map((g) => ({
        parcelId: g.parcelId,
        displayId: g.displayId,
        label: g.label,
        rows: rowsByParcel.get(g.parcelId) ?? [],
        files: parcelFilesOf(g.records, parcelId),
      }))
      .filter((g) => g.rows.length + g.files.length > 0),
  }
}
