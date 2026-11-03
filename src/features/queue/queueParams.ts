import { stateFilterOptions } from '@/features/queue/stateFilterOptions'

export interface QueueSearchParams {
  state?: string
  q?: string
  mine?: string
  overdue?: string
  unpaid?: string
  cursor?: string
}

export interface QueueToggle {
  name: 'mine' | 'overdue' | 'unpaid'
  label: string
  on: boolean
}

function present(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

export function queueToggles(params: QueueSearchParams): QueueToggle[] {
  return [
    { name: 'mine', label: 'Assigned to me', on: params.mine === '1' },
    { name: 'overdue', label: 'Overdue only', on: params.overdue === '1' },
    { name: 'unpaid', label: 'Fees due', on: params.unpaid === '1' },
  ]
}

function stateLabelFor(state: string | undefined): string | null {
  if (!present(state)) return null
  return stateFilterOptions().find(([value]) => value === state)?.[1] ?? null
}

export function activeFilterLabels(params: QueueSearchParams): string[] {
  const state = stateLabelFor(params.state)
  return [
    ...(present(params.q) ? [`Number contains ${params.q}`] : []),
    ...(state === null ? [] : [state]),
    ...queueToggles(params)
      .filter((toggle) => toggle.on)
      .map((toggle) => toggle.label),
  ]
}

function filterEntries(params: QueueSearchParams): [string, string | undefined][] {
  return [
    ['state', params.state],
    ['q', params.q],
    ['mine', params.mine],
    ['overdue', params.overdue],
    ['unpaid', params.unpaid],
  ]
}

export function queueHref(params: QueueSearchParams, cursor: string | null): string {
  const query = new URLSearchParams()
  for (const [name, value] of filterEntries(params)) {
    if (present(value)) query.set(name, value)
  }
  if (cursor !== null && cursor !== '0') query.set('cursor', cursor)
  const text = query.toString()
  return text === '' ? '/staff/queue' : `/staff/queue?${text}`
}

export function filterKey(params: QueueSearchParams): string {
  return [...filterEntries(params), ['cursor', params.cursor]]
    .map(([, value]) => value ?? '')
    .join('|')
}
