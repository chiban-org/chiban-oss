import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { clearHref, firstParam, type TableParams } from '@/features/dataTable/params'
import { DIR_PARAM, SORT_PARAM } from '@/features/dataTable/sort'
import { contactChips, TAB_LABELS } from '@/features/rosters/contactChips'
import {
  CONTACT_FILTER_PARAMS,
  type ContactsQuery,
  type ContactTab,
  DUE_PARAM,
  KIND_PARAM,
  STATUS_PARAM,
  tabHref,
} from '@/features/rosters/contactListParams'
import type { KindCounts } from '@/features/rosters/contactListQuery'
import { NOTICE_CONTACTS_PATH } from '@/features/rosters/links'
import { ContactSearch } from './ContactSearch'

const CARRIED = [KIND_PARAM, STATUS_PARAM, DUE_PARAM, SORT_PARAM, DIR_PARAM] as const

export const SEARCH_LABELS: Readonly<Record<'entries' | 'missing', string>> = {
  entries: 'Search name, parcel ID or address',
  missing: 'Search parcel ID or address',
}

function carried(params: TableParams): [string, string][] {
  return CARRIED.flatMap((name) => {
    const value = firstParam(params, name)
    return value === undefined ? [] : [[name, value] as [string, string]]
  })
}

export function ContactToolbar({
  params,
  query,
  counts,
}: {
  params: TableParams
  query: ContactsQuery
  counts: KindCounts | null
}) {
  const clear = clearHref(NOTICE_CONTACTS_PATH, params, CONTACT_FILTER_PARAMS)
  return (
    <div className="toolbar flex flex-wrap items-center gap-x-3 gap-y-3">
      <ContactSearch
        search={query.search}
        label={counts === null ? SEARCH_LABELS.missing : SEARCH_LABELS.entries}
        carried={carried(params)}
      />
      {counts === null ? (
        clear === null ? null : (
          <Link href={clear} className="ml-1 text-sm">
            Clear all
          </Link>
        )
      ) : (
        <QuickFilters
          label="Quick filters"
          groups={contactChips(params, query, counts)}
          clearHref={clear}
        />
      )}
    </div>
  )
}

export function PinnedEntryNote({ tab }: { tab: ContactTab }) {
  return (
    <p className="text-sm">
      {'Showing the contact an abutter list links to. '}
      <Link href={tabHref(tab)}>{`Show all ${(TAB_LABELS.get(tab) ?? '').toLowerCase()}`}</Link>
    </p>
  )
}
