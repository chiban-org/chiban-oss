import type { ClockExplanation } from './explainClock'

type ClockLike = Pick<ClockExplanation, 'status' | 'daysRemaining'>

const STATUS_ORDER: Record<ClockExplanation['status'], number> = {
  overdue: 0,
  running: 1,
  met: 2,
  stopped: 3,
  lapsed: 4,
  superseded: 5,
}

export function isOpen(clock: ClockLike): boolean {
  return clock.status === 'running' || clock.status === 'overdue'
}

export function isLate(clock: ClockLike): boolean {
  return clock.status === 'overdue' || (clock.status === 'running' && clock.daysRemaining < 0)
}

function rank(clock: ClockLike): number {
  return isLate(clock) ? STATUS_ORDER.overdue : STATUS_ORDER[clock.status]
}

export function sortClocks<T extends ClockLike>(clocks: readonly T[]): T[] {
  return [...clocks].sort(
    (a, b) => rank(a) - rank(b) || (isOpen(a) && isOpen(b) ? a.daysRemaining - b.daysRemaining : 0),
  )
}

export function overdueCount(clocks: readonly ClockLike[]): number {
  return clocks.filter(isLate).length
}

export function dueNext<T extends ClockLike>(clocks: readonly T[]): T | null {
  return sortClocks(clocks.filter(isOpen))[0] ?? null
}

export function otherOverdue(clocks: readonly ClockLike[]): number {
  const next = dueNext(clocks)
  const late = overdueCount(clocks)
  return next !== null && isLate(next) ? late - 1 : late
}

export function expandedClocks<T extends ClockLike>(clocks: readonly T[]): Set<T> {
  const next = dueNext(clocks)
  return new Set(clocks.filter((c) => isLate(c) || c === next))
}
