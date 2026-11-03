import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterValues, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { DUE_FILTERS, type DueFilter } from '@/features/queue/queueParams'

export const BOARDS_PATH = '/staff/boards'

export type BoardSortKey = 'application' | 'status' | 'filed' | 'meeting' | 'deadline'

export const BOARD_SORT: SortConfig<BoardSortKey> = {
  defaultKey: 'filed',
  columns: {
    application: 'asc',
    status: 'asc',
    filed: 'asc',
    meeting: 'asc',
    deadline: 'asc',
  },
}

export const BOARD_FILTER_PARAMS = ['due', 'type'] as const

export interface BoardFilters {
  due?: DueFilter[]
  typeKeys?: string[]
}

export interface BoardsListView {
  params: TableParams
  sort: SortState<BoardSortKey>
  filters: BoardFilters
}

export function readBoardsListView(raw: RawSearchParams): BoardsListView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(BOARD_SORT, params),
    filters: {
      ...whenAny('due', filterValues(params, 'due', DUE_FILTERS)),
      ...whenAny(
        'typeKeys',
        filterValues(params, 'type', (value) => value !== ''),
      ),
    },
  }
}
