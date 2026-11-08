import { type TableParams, tableHref } from '@/features/dataTable/params'
import type { ChipGroupView, ChipView } from '@/features/dataTable/quickFilters'
import {
  type ContactsQuery,
  type ContactTab,
  DUE_PARAM,
  DUE_VALUE,
  ENDED_VALUE,
  ENTRY_PARAM,
  type EntryTab,
  STATUS_PARAM,
  tabHref,
} from '@/features/rosters/contactListParams'
import type { KindCounts } from '@/features/rosters/contactListQuery'
import { NOTICE_CONTACTS_PATH } from '@/features/rosters/links'

export const TAB_LABELS: ReadonlyMap<ContactTab, string> = new Map([
  ['missing', 'Missing association'],
  ['associations', 'Associations'],
  ['parks', 'Parks'],
  ['holders', 'Restriction holders'],
  ['regional', 'Regional and state'],
])

export function contactTabs(
  current: ContactTab,
  totals: Readonly<Record<EntryTab, KindCounts>>,
  gapCount: number,
): ChipView[] {
  const tab = (key: ContactTab, count?: number): ChipView => ({
    label: TAB_LABELS.get(key) ?? key,
    href: tabHref(key),
    active: key === current,
    ...(count === undefined ? {} : { count }),
  })
  return [
    ...(gapCount > 0 ? [tab('missing', gapCount)] : []),
    tab('associations', totals.associations.active),
    tab('parks', totals.parks.active),
    tab('holders', totals.holders.active),
    tab('regional'),
  ]
}

export function contactChips(
  params: TableParams,
  query: ContactsQuery,
  counts: KindCounts,
): ChipGroupView[] {
  const href = (patch: Record<string, string | null>) =>
    tableHref(NOTICE_CONTACTS_PATH, params, { ...patch, [ENTRY_PARAM]: null })
  const pinned = query.entry !== null
  return [
    {
      label: 'Check',
      display: 'inline',
      chips: [
        {
          label: 'Due for a check',
          href: href({ [DUE_PARAM]: query.due ? null : DUE_VALUE }),
          active: query.due && !pinned,
          count: counts.due,
        },
      ],
    },
    {
      label: 'Status',
      display: 'inline',
      chips: [
        {
          label: 'Active',
          href: href({ [STATUS_PARAM]: null }),
          active: query.status === 'active' && !pinned,
          count: counts.active,
        },
        {
          label: 'Ended',
          href: href({ [STATUS_PARAM]: query.status === 'ended' ? null : ENDED_VALUE }),
          active: query.status === 'ended' && !pinned,
          count: counts.ended,
        },
      ],
    },
  ]
}
