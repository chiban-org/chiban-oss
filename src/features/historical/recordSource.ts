import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { historicalRecords } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import {
  type ParcelRecordSummary,
  registerParcelRecordSource,
  type Viewer,
} from '@/features/parcels/recordSources'
import type { CivilDate } from '@/types/civilDate'

export const HISTORICAL_RECORD_SOURCE_KIND = 'historical_record'

const PUBLIC_COLUMNS = {
  id: historicalRecords.id,
  recordType: historicalRecords.recordType,
  number: historicalRecords.number,
  recordedOn: historicalRecords.recordedOn,
  description: historicalRecords.description,
}

function keptValuesText(values: Record<string, string>): string | null {
  const parts = Object.entries(values).map(([name, value]) => `${name}: ${value}`)
  return parts.length === 0 ? null : parts.join('; ')
}

function joinNote(parts: (string | null)[]): string | null {
  const present = parts.filter((p): p is string => p !== null)
  return present.length === 0 ? null : present.join('. ')
}

function summary(
  row: {
    id: string
    recordType: string
    number: string | null
    recordedOn: string | null
    description: string | null
  },
  kept: string | null,
): ParcelRecordSummary {
  return {
    kind: HISTORICAL_RECORD_SOURCE_KIND,
    recordId: row.id,
    title: row.recordType,
    number: row.number,
    status: { label: 'Historical record', chip: 'neutral' },
    date: row.recordedOn as CivilDate | null,
    type: { key: HISTORICAL_RECORD_SOURCE_KIND, label: 'Historical record' },
    dates: { filed: row.recordedOn as CivilDate | null, issued: null, expires: null, closed: null },
    href: null,
    note: joinNote([row.description, kept]),
  }
}

export async function summarizeHistoricalRecords(
  db: DbOrTx,
  ids: string[],
  viewer: Viewer,
  signal: AbortSignal,
): Promise<ParcelRecordSummary[]> {
  signal.throwIfAborted()
  if (viewer.kind === 'actor' && hasFullRecordAccess(viewer.actor)) {
    const rows = await db
      .select({ ...PUBLIC_COLUMNS, values: historicalRecords.values })
      .from(historicalRecords)
      .where(inArray(historicalRecords.id, ids))
    return rows.map((row) => summary(row, keptValuesText(row.values)))
  }
  const rows = await db
    .select(PUBLIC_COLUMNS)
    .from(historicalRecords)
    .where(inArray(historicalRecords.id, ids))
  return rows.map((row) => summary(row, null))
}

export function registerHistoricalRecordSource(): void {
  registerParcelRecordSource({
    kind: HISTORICAL_RECORD_SOURCE_KIND,
    summarize: summarizeHistoricalRecords,
  })
}

registerHistoricalRecordSource()
