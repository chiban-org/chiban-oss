import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import {
  type ChipGroupView,
  chipGroups,
  filterValues,
  labeledOptions,
  singleValue,
} from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { OVERRIDE_STATUS_LABELS, OVERRIDE_STATUSES } from '@/features/overrides/overrideStatus'
import type { AliasOverrideRow, OverrideStatus } from '@/features/parcels/aliasOverrides'
import { countGroups, filterRows } from '@/features/staffTables/listFilters'
import { sortRows } from '@/features/staffTables/sortRows'

export const ALIAS_OVERRIDES_PATH = '/staff/overrides/aliases'

export type AliasSortKey = 'newest' | 'id' | 'parcel' | 'replaced' | 'reason' | 'expires' | 'status'

export const ALIAS_SORT: SortConfig<AliasSortKey> = {
  defaultKey: 'newest',
  columns: {
    newest: 'desc',
    id: 'asc',
    parcel: 'asc',
    replaced: 'asc',
    reason: 'asc',
    expires: 'asc',
    status: 'asc',
  },
}

export const ALIAS_FILTER_PARAMS = ['status', 'expiry'] as const

export const EXPIRY_VALUES = ['dated', 'never'] as const
type Expiry = (typeof EXPIRY_VALUES)[number]

const EXPIRY_LABELS: ReadonlyMap<Expiry, string> = new Map([
  ['dated', 'Has an expiry date'],
  ['never', 'Never expires'],
])

export interface AliasOverrideView {
  params: TableParams
  sort: SortState<AliasSortKey>
  status: OverrideStatus[]
  expiry: Expiry[]
}

export function readAliasOverrideView(raw: RawSearchParams): AliasOverrideView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(ALIAS_SORT, params),
    status: filterValues(params, 'status', OVERRIDE_STATUSES),
    expiry: singleValue(params, 'expiry', EXPIRY_VALUES),
  }
}

const replacedText = (row: AliasOverrideRow): string | null =>
  row.replaced === null ? null : row.replaced.displayId || row.replaced.parcelId

function groupsFor(view: AliasOverrideView) {
  return {
    status: { value: (r: AliasOverrideRow) => r.status, selected: view.status },
    expiry: {
      value: (r: AliasOverrideRow) => (r.expiresOn === null ? 'never' : 'dated'),
      selected: view.expiry,
    },
  }
}

export function arrangeAliasOverrides(rows: readonly AliasOverrideRow[], view: AliasOverrideView) {
  const groups = groupsFor(view)
  const visible = sortRows(filterRows(rows, groups), view.sort, {
    newest: null,
    id: (r) => `${r.format}: ${r.value}`,
    parcel: (r) => r.parcelDisplayId,
    replaced: replacedText,
    reason: (r) => r.reason,
    expires: (r) => r.expiresOn,
    status: (r) => OVERRIDE_STATUS_LABELS.get(r.status) ?? r.status,
  })
  const counts = countGroups(rows, groups, { status: OVERRIDE_STATUSES, expiry: EXPIRY_VALUES })
  const chips: ChipGroupView[] = chipGroups(ALIAS_OVERRIDES_PATH, view.params, [
    {
      param: 'status',
      label: 'Status',
      options: labeledOptions(OVERRIDE_STATUS_LABELS, counts.get('status')),
    },
    {
      param: 'expiry',
      label: 'Expiry',
      options: labeledOptions(EXPIRY_LABELS, counts.get('expiry')),
      single: true,
    },
  ])
  return { rows: visible, chips }
}
