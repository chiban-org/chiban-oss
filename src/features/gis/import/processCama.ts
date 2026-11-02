import { applyCamaRow } from '@/features/gis/import/applyCamaRow'
import type { RowResult } from '@/features/gis/import/applyParcelRow'
import type { ImportContext } from '@/features/gis/import/context'
import { prepareCamaRows } from '@/features/gis/import/prepareCamaRows'
import type { SourceFeature } from '@/features/gis/import/types'
import type { IdFormat } from '@/features/parcels/idFormats'

export interface CamaProcessed {
  results: RowResult[]
  keys: string[]
  seenIds: Set<string>
  format: string
}

export async function processCamaRows(
  ctx: ImportContext,
  features: SourceFeature[],
  formatKey: string,
  formats: Map<string, IdFormat>,
): Promise<CamaProcessed> {
  const rows = prepareCamaRows(features, formatKey, formats)
  const results: RowResult[] = []
  const seenIds = new Set<string>()
  for (const row of rows) {
    if (row.id !== null && row.failure === null) seenIds.add(row.id.value)
    results.push(await applyCamaRow(ctx, row))
  }
  return { results, keys: rows.map((r) => r.rowKey), seenIds, format: formatKey }
}
