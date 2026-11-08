import {
  firstParam,
  type RawSearchParams,
  readOffset,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'

export const CONTRACTORS_PATH = '/staff/contractors'

export const DIRECTORY_PAGE_SIZE = 25

export type DirectorySortKey = 'company' | 'contact' | 'projects' | 'activity'

export const DIRECTORY_SORT: SortConfig<DirectorySortKey> = {
  defaultKey: 'company',
  columns: { company: 'asc', contact: 'asc', projects: 'desc', activity: 'desc' },
}

export interface DirectoryView {
  params: TableParams
  q: string
  sort: SortState<DirectorySortKey>
  offset: number
}

export function readDirectoryView(raw: RawSearchParams): DirectoryView {
  const params = readTableParams(raw)
  return {
    params,
    q: (firstParam(params, 'q') ?? '').trim().slice(0, 100),
    sort: parseSort(DIRECTORY_SORT, params),
    offset: readOffset(params),
  }
}
