import type { KeyRow } from '@/features/config/settingsViews'
import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import {
  type ChipGroupView,
  chipGroups,
  labeledOptions,
  singleValue,
} from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import type { RuleSummary } from '@/features/packs/ruleSummary'
import { countGroups, filterRows } from '@/features/staffTables/listFilters'
import { sortRows } from '@/features/staffTables/sortRows'

export const STATE_LAW_PATH = '/staff/settings/state-law'

export const RULE_TABLE_SCOPE = 'rules'

export type RuleSortKey = 'order' | 'rule' | 'citation' | 'policy'
export const RULE_SORT: SortConfig<RuleSortKey> = {
  defaultKey: 'order',
  columns: { order: 'asc', rule: 'asc', citation: 'asc', policy: 'asc' },
}

export function sortRuleSummaries(rows: readonly RuleSummary[], state: SortState<RuleSortKey>) {
  return sortRows(rows, state, {
    order: null,
    rule: (r) => r.label,
    citation: (r) => r.citation.label,
    policy: (r) => r.policy,
  })
}

export type KeySortKey = 'order' | 'key' | 'label' | 'published' | 'draft'
export const KEY_SORT: SortConfig<KeySortKey> = {
  defaultKey: 'order',
  columns: { order: 'asc', key: 'asc', label: 'asc', published: 'desc', draft: 'desc' },
}

export const KEY_FILTER_PARAMS = ['published', 'draft'] as const

const PUBLISHED_VALUES = ['published', 'unpublished'] as const
const DRAFT_VALUES = ['draft', 'none'] as const

const PUBLISHED_LABELS: ReadonlyMap<string, string> = new Map([
  ['published', 'In use'],
  ['unpublished', 'Not in use yet'],
])
const DRAFT_LABELS: ReadonlyMap<string, string> = new Map([
  ['draft', 'Has a draft not in use yet'],
  ['none', 'No draft'],
])

export interface KeyListView {
  params: TableParams
  sort: SortState<KeySortKey>
  published: (typeof PUBLISHED_VALUES)[number][]
  draft: (typeof DRAFT_VALUES)[number][]
}

export function readKeyListView(raw: RawSearchParams): KeyListView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(KEY_SORT, params),
    published: singleValue(params, 'published', PUBLISHED_VALUES),
    draft: singleValue(params, 'draft', DRAFT_VALUES),
  }
}

export function arrangeKeyRows(
  path: string,
  rows: readonly KeyRow[],
  view: KeyListView,
): { rows: KeyRow[]; chips: ChipGroupView[] } {
  const groups = {
    published: {
      value: (r: KeyRow) => (r.publishedVersion === null ? 'unpublished' : 'published'),
      selected: view.published,
    },
    draft: { value: (r: KeyRow) => (r.hasDraft ? 'draft' : 'none'), selected: view.draft },
  }
  const visible = sortRows(filterRows(rows, groups), view.sort, {
    order: null,
    key: (r) => r.key,
    label: (r) => r.label,
    published: (r) => r.publishedVersion,
    draft: (r) => (r.hasDraft ? 1 : 0),
  })
  const counts = countGroups(rows, groups, {
    published: PUBLISHED_VALUES,
    draft: DRAFT_VALUES,
  })
  const chips = chipGroups(path, view.params, [
    {
      param: 'published',
      label: 'In use',
      options: labeledOptions(PUBLISHED_LABELS, counts.get('published')),
      single: true,
    },
    {
      param: 'draft',
      label: 'Draft',
      options: labeledOptions(DRAFT_LABELS, counts.get('draft')),
      single: true,
    },
  ])
  return { rows: visible, chips }
}
