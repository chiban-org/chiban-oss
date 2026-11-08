import {
  firstParam,
  type RawSearchParams,
  readOffset,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import type { EntryKind } from '@/features/rosters/confirm'
import { NOTICE_CONTACTS_PATH } from '@/features/rosters/links'
import { isUuid } from '@/utils/uuid'

export const CONTACT_TABS = ['missing', 'associations', 'parks', 'holders', 'regional'] as const
export type ContactTab = (typeof CONTACT_TABS)[number]

export const ENTRY_TABS = ['associations', 'parks', 'holders'] as const
export type EntryTab = (typeof ENTRY_TABS)[number]

export const DEFAULT_TAB: ContactTab = 'associations'

export const TAB_KIND: Readonly<Record<EntryTab, EntryKind>> = {
  associations: 'association',
  parks: 'park',
  holders: 'restriction',
}

export const KIND_PARAM = 'kind'
export const SEARCH_PARAM = 'q'
export const STATUS_PARAM = 'status'
export const DUE_PARAM = 'due'
export const ENTRY_PARAM = 'entry'
export const ENDED_VALUE = 'ended'
export const DUE_VALUE = 'yes'

export const CONTACT_FILTER_PARAMS = [SEARCH_PARAM, STATUS_PARAM, DUE_PARAM, ENTRY_PARAM] as const

export const CONTACTS_PAGE_SIZE = 25

export type ContactSortKey = 'name' | 'parcel' | 'checked'

export const CONTACT_SORT: SortConfig<ContactSortKey> = {
  defaultKey: 'name',
  columns: { name: 'asc', parcel: 'asc', checked: 'asc' },
}

export type ContactStatus = 'active' | 'ended'

export interface ContactsQuery {
  tab: ContactTab
  search: string
  status: ContactStatus
  due: boolean
  entry: string | null
  sort: SortState<ContactSortKey>
  offset: number
}

export function isEntryTab(tab: ContactTab): tab is EntryTab {
  return (ENTRY_TABS as readonly string[]).includes(tab)
}

function readTab(params: TableParams): ContactTab {
  if (firstParam(params, 'add') === 'association') return 'associations'
  const given = firstParam(params, KIND_PARAM)
  return CONTACT_TABS.find((tab) => tab === given) ?? DEFAULT_TAB
}

function readEntry(params: TableParams): string | null {
  const given = firstParam(params, ENTRY_PARAM)
  return given !== undefined && isUuid(given) ? given : null
}

export function readContactsQuery(raw: RawSearchParams): {
  params: TableParams
  query: ContactsQuery
} {
  const params = readTableParams(raw)
  return {
    params,
    query: {
      tab: readTab(params),
      search: (firstParam(params, SEARCH_PARAM) ?? '').trim(),
      status: firstParam(params, STATUS_PARAM) === ENDED_VALUE ? 'ended' : 'active',
      due: firstParam(params, DUE_PARAM) === DUE_VALUE,
      entry: readEntry(params),
      sort: parseSort(CONTACT_SORT, params),
      offset: readOffset(params),
    },
  }
}

export function tabHref(tab: ContactTab, extra: Readonly<Record<string, string>> = {}): string {
  const query = new URLSearchParams(tab === DEFAULT_TAB ? extra : { [KIND_PARAM]: tab, ...extra })
  const text = query.toString()
  return text === '' ? NOTICE_CONTACTS_PATH : `${NOTICE_CONTACTS_PATH}?${text}`
}
