import type { RecordSeries } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { loadPack } from '@/features/packs/loadPack'

export function findSeries(key: string): RecordSeries | null {
  return loadPack().recordSeries.find((s) => s.key === key) ?? null
}

export function requireSeries(key: string): RecordSeries {
  const found = findSeries(key)
  if (found === null) throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, `no record series ${key}`)
  return found
}

export function defaultSeriesKey(classification: string): string | null {
  return loadPack().recordSeriesDefaults.byClassification[classification] ?? null
}
