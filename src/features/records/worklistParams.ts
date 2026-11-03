import {
  firstParam,
  type RawSearchParams,
  readOffset,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortState } from '@/features/dataTable/sort'
import {
  WORKLIST_SORT,
  WORKLIST_STATES,
  type WorklistSortKey,
  type WorklistState,
} from '@/features/records/worklist'

export const RETENTION_PATH = '/staff/records/retention'

export interface RetentionView {
  params: TableParams
  state: WorklistState
  sort: SortState<WorklistSortKey>
  offset: number
  allBatches: boolean
}

export function readRetentionView(raw: RawSearchParams): RetentionView {
  const params = readTableParams(raw)
  const chosen = firstParam(params, 'state')
  return {
    params,
    state: WORKLIST_STATES.find((s) => s === chosen) ?? 'eligible',
    sort: parseSort(WORKLIST_SORT, params),
    offset: readOffset(params),
    allBatches: firstParam(params, 'batches') === 'all',
  }
}
