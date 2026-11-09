import type { CoreState } from '@/features/applications/states'
import { firstParam, type TableParams } from '@/features/dataTable/params'

export const CONTRACTOR_TABS = ['all', 'review', 'issued', 'closed'] as const
export type ContractorTab = (typeof CONTRACTOR_TABS)[number]

export const TAB_PARAM = 'status'
export const SEARCH_PARAM = 'q'
export const SEARCH_MAX = 100

export const TAB_LABELS: ReadonlyMap<ContractorTab, string> = new Map([
  ['all', 'All'],
  ['review', 'In review'],
  ['issued', 'Issued'],
  ['closed', 'Closed'],
])

export const TAB_STATES: Readonly<Record<Exclude<ContractorTab, 'all'>, readonly CoreState[]>> = {
  review: ['submitted', 'under_review', 'decided'],
  issued: ['issued', 'suspended'],
  closed: ['closed', 'denied', 'withdrawn', 'expired'],
}

export const OPEN_STATES: readonly CoreState[] = [...TAB_STATES.review, ...TAB_STATES.issued]

export function tabOfState(state: CoreState): Exclude<ContractorTab, 'all'> | null {
  if (TAB_STATES.review.includes(state)) return 'review'
  if (TAB_STATES.issued.includes(state)) return 'issued'
  if (TAB_STATES.closed.includes(state)) return 'closed'
  return null
}

export function readTab(params: TableParams): ContractorTab {
  const raw = firstParam(params, TAB_PARAM)
  return CONTRACTOR_TABS.find((tab) => tab === raw) ?? 'all'
}

export function readSearch(params: TableParams): string {
  return (firstParam(params, SEARCH_PARAM) ?? '').trim().slice(0, SEARCH_MAX)
}

export type TabCounts = Record<ContractorTab, number>
