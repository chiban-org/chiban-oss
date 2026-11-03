import { CORE_STATES, type CoreState, TERMINAL_STATES } from '@/features/applications/states'
import { firstParam, type TableParams } from '@/features/dataTable/params'

export const NEEDS_ACTION_STATES: readonly CoreState[] = CORE_STATES.filter(
  (state) => state !== 'draft' && !TERMINAL_STATES.includes(state),
)

export const STATUS_TAB_PARAM = 'stage'

export const STATUS_TABS = ['action', 'open', 'issued', 'finished', 'all'] as const
export type StatusTab = (typeof STATUS_TABS)[number]

export const DEFAULT_STATUS_TAB: StatusTab = 'action'

export const STATUS_TAB_LABELS: ReadonlyMap<StatusTab, string> = new Map([
  ['action', 'Needs action'],
  ['open', 'Open'],
  ['issued', 'Issued or suspended'],
  ['finished', 'Closed, denied, withdrawn or expired'],
  ['all', 'All'],
])

export const STATUS_TAB_STATES: ReadonlyMap<StatusTab, readonly CoreState[]> = new Map<
  StatusTab,
  readonly CoreState[]
>([
  ['open', ['draft', 'submitted', 'under_review', 'decided']],
  ['issued', ['issued', 'suspended']],
  ['finished', ['closed', 'denied', 'withdrawn', 'expired']],
  ['all', CORE_STATES],
])

export function statesForTab(tab: StatusTab): CoreState[] | undefined {
  const states = STATUS_TAB_STATES.get(tab)
  return states === undefined ? undefined : [...states]
}

function asTab(value: string | undefined): StatusTab | undefined {
  return STATUS_TABS.find((tab) => tab === value)
}

export function readStatusTab(params: TableParams): StatusTab {
  return asTab(firstParam(params, STATUS_TAB_PARAM)) ?? DEFAULT_STATUS_TAB
}

export function tabForState(state: string | undefined): StatusTab {
  if (state === 'all') return 'all'
  const holder = [...STATUS_TAB_STATES].find(
    ([tab, states]) => tab !== 'all' && states.some((s) => s === state),
  )
  return holder?.[0] ?? DEFAULT_STATUS_TAB
}
