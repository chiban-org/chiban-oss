import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { STAFF_STATUSES, type StaffStatus } from '@/features/users/staffAccounts'

export const USERS_PATH = '/staff/admin/users'

export type UserSortKey = 'name' | 'email' | 'roles' | 'authenticator'

export const USER_SORT: SortConfig<UserSortKey> = {
  defaultKey: 'name',
  columns: { name: 'asc', email: 'asc', roles: 'asc', authenticator: 'desc' },
}

export interface UserListView {
  params: TableParams
  tab: StaffStatus
  sort: SortState<UserSortKey>
}

export function readUserListView(raw: RawSearchParams): UserListView {
  const params = readTableParams(raw)
  const requested = params.get('tab')?.[0]
  return {
    params,
    tab: STAFF_STATUSES.find((s) => s === requested) ?? 'active',
    sort: parseSort(USER_SORT, params),
  }
}
