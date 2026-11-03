import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'

export const MEMBERS_PATH = '/staff/boards/members'

export type MemberTab = 'active' | 'ended'

export type MemberSortKey = 'name' | 'email' | 'board' | 'role' | 'term' | 'status'

export const MEMBER_SORT: SortConfig<MemberSortKey> = {
  defaultKey: 'board',
  columns: { name: 'asc', email: 'asc', board: 'asc', role: 'asc', term: 'desc', status: 'asc' },
}

export interface MembersListView {
  params: TableParams
  tab: MemberTab
  sort: SortState<MemberSortKey>
}

export function readMembersView(raw: RawSearchParams): MembersListView {
  const params = readTableParams(raw)
  return {
    params,
    tab: params.get('tab')?.[0] === 'ended' ? 'ended' : 'active',
    sort: parseSort(MEMBER_SORT, params),
  }
}
