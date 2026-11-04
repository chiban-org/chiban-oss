import {
  ADJUSTMENT_KIND_LABELS,
  ADJUSTMENT_KINDS,
  type AdjustmentKind,
  adjustmentKindLabel,
} from '@/features/clocks/adjustmentKinds'
import type { ClockAdjustmentRow } from '@/features/clocks/clockOverrides'
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
import { OVERRIDE_STATUS_LABELS, OVERRIDE_STATUSES } from '@/features/overrides/overrideStatus'
import { ruleLabel } from '@/features/packs/ruleLabel'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'
import { countGroups, filterRows } from '@/features/staffTables/listFilters'
import { sortRows } from '@/features/staffTables/sortRows'

export const CLOCK_OVERRIDES_PATH = '/staff/overrides/clocks'

export type ClockSortKey =
  | 'newest'
  | 'application'
  | 'rule'
  | 'adjustment'
  | 'due'
  | 'reason'
  | 'status'

export const CLOCK_SORT: SortConfig<ClockSortKey> = {
  defaultKey: 'newest',
  columns: {
    newest: 'desc',
    application: 'asc',
    rule: 'asc',
    adjustment: 'asc',
    due: 'asc',
    reason: 'asc',
    status: 'asc',
  },
}

export const CLOCK_FILTER_PARAMS = ['status', 'kind'] as const

export interface ClockAdjustmentView {
  params: TableParams
  sort: SortState<ClockSortKey>
  status: OverrideStatus[]
  kind: AdjustmentKind[]
}

export function readClockAdjustmentView(raw: RawSearchParams): ClockAdjustmentView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(CLOCK_SORT, params),
    status: filterValues(params, 'status', OVERRIDE_STATUSES),
    kind: filterValues(params, 'kind', ADJUSTMENT_KINDS),
  }
}

function groupsFor(view: ClockAdjustmentView) {
  return {
    status: { value: (r: ClockAdjustmentRow) => r.status, selected: view.status },
    kind: { value: (r: ClockAdjustmentRow) => r.kind, selected: view.kind },
  }
}

export function arrangeClockAdjustments(
  rows: readonly ClockAdjustmentRow[],
  view: ClockAdjustmentView,
) {
  const groups = groupsFor(view)
  const visible = sortRows(filterRows(rows, groups), view.sort, {
    newest: null,
    application: (r) => r.applicationNumber,
    rule: (r) => ruleLabel(r.ruleKey),
    adjustment: (r) => adjustmentKindLabel(r.kind),
    due: (r) => r.newDue,
    reason: (r) => r.reason,
    status: (r) => OVERRIDE_STATUS_LABELS.get(r.status) ?? r.status,
  })
  const counts = countGroups(rows, groups, { status: OVERRIDE_STATUSES, kind: ADJUSTMENT_KINDS })
  const chips: ChipGroupView[] = chipGroups(CLOCK_OVERRIDES_PATH, view.params, [
    {
      param: 'status',
      label: 'Status',
      options: labeledOptions(OVERRIDE_STATUS_LABELS, counts.get('status')),
    },
    {
      param: 'kind',
      label: 'Adjustment',
      options: labeledOptions(ADJUSTMENT_KIND_LABELS, counts.get('kind')),
    },
  ])
  return { rows: visible, chips }
}
