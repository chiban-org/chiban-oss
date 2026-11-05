import {
  clearHref,
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
import {
  parseSort,
  type SortConfig,
  type SortLink,
  type SortState,
  sortLinks,
} from '@/features/dataTable/sort'
import type { RecordGroup, RecordRow, RecordTable } from '@/features/parcels/recordTable'
import { countGroups, filterRows, type ListGroups } from '@/features/staffTables/listFilters'
import { COLLATOR, sortRows } from '@/features/staffTables/sortRows'

export const RECORDS_ANCHOR = '#records'

export type RecordSortKey =
  | 'activity'
  | 'number'
  | 'status'
  | 'filed'
  | 'issued'
  | 'expires'
  | 'closed'

export const RECORD_SORT: SortConfig<RecordSortKey> = {
  defaultKey: 'activity',
  columns: {
    activity: 'desc',
    number: 'asc',
    status: 'asc',
    filed: 'desc',
    issued: 'desc',
    expires: 'asc',
    closed: 'desc',
  },
}

export const RECORD_FILTER_PARAMS = ['kind', 'state'] as const

const STATES = ['open', 'closed'] as const
type RecordState = (typeof STATES)[number]
const STATE_LABELS = new Map<RecordState, string>([
  ['open', 'Open'],
  ['closed', 'Closed'],
])

function stateOf(row: RecordRow): RecordState {
  return row.closed ? 'closed' : 'open'
}

export interface RecordTableView {
  params: TableParams
  sort: SortState<RecordSortKey>
  kind: string[]
  state: RecordState[]
}

export function readRecordTableView(raw: RawSearchParams): RecordTableView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(RECORD_SORT, params),
    kind: filterValues(params, 'kind', () => true),
    state: singleValue(params, 'state', STATES),
  }
}

function byNumberNewestFirst(a: RecordRow, b: RecordRow): number {
  return COLLATOR.compare(b.number ?? '', a.number ?? '') || a.key.localeCompare(b.key)
}

const ACCESSORS = {
  activity: (r: RecordRow) => r.activity,
  number: (r: RecordRow) => r.number,
  status: (r: RecordRow) => r.status.label,
  filed: (r: RecordRow) => r.dates.filed,
  issued: (r: RecordRow) => r.dates.issued,
  expires: (r: RecordRow) => r.dates.expires,
  closed: (r: RecordRow) => r.dates.closed,
}

function groupsFor(view: RecordTableView): ListGroups<RecordRow, 'kind' | 'state'> {
  return {
    kind: { value: (r) => r.typeKey, selected: view.kind },
    state: { value: stateOf, selected: view.state },
  }
}

function kindLabels(rows: readonly RecordRow[]): Map<string, string> {
  const labels = new Map<string, string>()
  for (const row of rows) if (!labels.has(row.typeKey)) labels.set(row.typeKey, row.typeLabel)
  return new Map([...labels].sort(([, a], [, b]) => COLLATOR.compare(a, b)))
}

function anchored(href: string): string {
  return `${href}${RECORDS_ANCHOR}`
}

function anchoredLinks(links: Record<RecordSortKey, SortLink>): Record<RecordSortKey, SortLink> {
  return Object.fromEntries(
    Object.entries(links).map(([key, link]) => [key, { ...link, href: anchored(link.href) }]),
  ) as Record<RecordSortKey, SortLink>
}

export interface ArrangedRecords {
  own: RecordRow[]
  ancestral: RecordGroup[]
  chips: ChipGroupView[]
  links: Record<RecordSortKey, SortLink>
  clear: string | null
  total: number
}

export function arrangeRecordTable(
  table: RecordTable,
  view: RecordTableView,
  path: string,
): ArrangedRecords {
  const groups = groupsFor(view)
  const arrange = (rows: readonly RecordRow[]) =>
    sortRows(filterRows([...rows].sort(byNumberNewestFirst), groups), view.sort, ACCESSORS)
  const all = [...table.own, ...table.ancestral.flatMap((g) => g.rows)]
  const labels = kindLabels(all)
  const counts = countGroups(all, groups, { kind: [...labels.keys()], state: STATES })
  const chips = chipGroups(path, view.params, [
    { param: 'kind', label: 'Record', options: labeledOptions(labels, counts.get('kind')) },
    {
      param: 'state',
      label: 'Open or closed',
      single: true,
      options: labeledOptions(STATE_LABELS, counts.get('state')),
    },
  ]).map((group) => ({
    ...group,
    chips: group.chips.map((chip) => ({ ...chip, href: anchored(chip.href) })),
  }))
  const clear = clearHref(path, view.params, RECORD_FILTER_PARAMS)
  return {
    own: arrange(table.own),
    ancestral: table.ancestral
      .map((g) => ({ ...g, rows: arrange(g.rows) }))
      .filter((g) => g.rows.length > 0),
    chips,
    links: anchoredLinks(sortLinks(path, view.params, RECORD_SORT, view.sort)),
    clear: clear === null ? null : anchored(clear),
    total: all.length,
  }
}
