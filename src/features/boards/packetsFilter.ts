import { type RawSearchParams, readTableParams } from '@/features/dataTable/params'
import { singleValue } from '@/features/dataTable/quickFilters'

export const PACKETS_PATH = '/staff/boards/packets'
export const PACKETS_FILTER_PARAM = 'packet'
export const UNSENT_PACKETS = 'unsent'
export const UNSENT_PACKETS_HREF = `${PACKETS_PATH}?${PACKETS_FILTER_PARAM}=${UNSENT_PACKETS}`

export interface PacketsFilter {
  unsentOnly: boolean
}

export function readPacketsFilter(raw: RawSearchParams): PacketsFilter {
  const chosen = singleValue(readTableParams(raw), PACKETS_FILTER_PARAM, [UNSENT_PACKETS])
  return { unsentOnly: chosen.length > 0 }
}

export function filterPacketRows<R extends { needsWork: boolean }>(
  rows: readonly R[],
  filter: PacketsFilter,
): R[] {
  return filter.unsentOnly ? rows.filter((row) => row.needsWork) : [...rows]
}
