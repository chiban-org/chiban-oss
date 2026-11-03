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
} from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import type { FeeOverrideRow } from '@/features/fees/feeOverrides'
import { OVERRIDE_STATUS_LABELS, OVERRIDE_STATUSES } from '@/features/overrides/overrideStatus'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'
import { countGroups, filterRows } from '@/features/staffTables/listFilters'
import { sortRows } from '@/features/staffTables/sortRows'

export const FEE_OVERRIDES_PATH = '/staff/overrides/fees'

export type FeeSortKey = 'newest' | 'application' | 'fee' | 'override' | 'reason' | 'status'

export const FEE_SORT: SortConfig<FeeSortKey> = {
  defaultKey: 'newest',
  columns: {
    newest: 'desc',
    application: 'asc',
    fee: 'asc',
    override: 'asc',
    reason: 'asc',
    status: 'asc',
  },
}

export const FEE_FILTER_PARAMS = ['status', 'kind'] as const

export const FEE_OVERRIDE_KINDS = ['waive', 'set_amount'] as const
type FeeOverrideKind = (typeof FEE_OVERRIDE_KINDS)[number]

const KIND_LABELS: ReadonlyMap<FeeOverrideKind, string> = new Map([
  ['waive', 'Waived'],
  ['set_amount', 'Set to an amount'],
])

export interface FeeOverrideView {
  params: TableParams
  sort: SortState<FeeSortKey>
  status: OverrideStatus[]
  kind: FeeOverrideKind[]
}

export function readFeeOverrideView(raw: RawSearchParams): FeeOverrideView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(FEE_SORT, params),
    status: filterValues(params, 'status', OVERRIDE_STATUSES),
    kind: filterValues(params, 'kind', FEE_OVERRIDE_KINDS),
  }
}

function groupsFor(view: FeeOverrideView) {
  return {
    status: { value: (r: FeeOverrideRow) => r.status, selected: view.status },
    kind: { value: (r: FeeOverrideRow) => r.kind, selected: view.kind },
  }
}

export function arrangeFeeOverrides(rows: readonly FeeOverrideRow[], view: FeeOverrideView) {
  const groups = groupsFor(view)
  const visible = sortRows(filterRows(rows, groups), view.sort, {
    newest: null,
    application: (r) => r.applicationNumber,
    fee: (r) => r.feeCode,
    override: (r) => (r.kind === 'waive' ? 0 : (r.amountCents ?? 0)),
    reason: (r) => r.reason,
    status: (r) => OVERRIDE_STATUS_LABELS.get(r.status) ?? r.status,
  })
  const counts = countGroups(rows, groups, { status: OVERRIDE_STATUSES, kind: FEE_OVERRIDE_KINDS })
  const chips: ChipGroupView[] = chipGroups(FEE_OVERRIDES_PATH, view.params, [
    {
      param: 'status',
      label: 'Status',
      options: labeledOptions(OVERRIDE_STATUS_LABELS, counts.get('status')),
    },
    { param: 'kind', label: 'Override', options: labeledOptions(KIND_LABELS, counts.get('kind')) },
  ])
  return { rows: visible, chips }
}
