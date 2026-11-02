import type { AttemptState } from '@/db/schema'
import type { ProcessorPaymentState } from '@/features/payments/processors/types'

const RANK: Partial<Record<AttemptState, number>> = {
  pending: 0,
  authorized: 1,
  captured: 2,
  settled: 3,
}

export type AttemptMove =
  | { kind: 'same' }
  | { kind: 'move'; to: AttemptState }
  | { kind: 'anomaly'; reason: string }

export function targetState(state: ProcessorPaymentState): AttemptState {
  switch (state.status) {
    case 'pending':
      return 'pending'
    case 'authorized':
      return 'authorized'
    case 'captured':
      return state.settled ? 'settled' : 'captured'
    case 'declined':
      return 'declined'
    case 'canceled':
      return 'voided'
  }
}

export function isMoneyState(state: AttemptState): boolean {
  return state === 'captured' || state === 'settled'
}

export function nextAttemptMove(current: AttemptState, state: ProcessorPaymentState): AttemptMove {
  const target = targetState(state)
  if (target === current) return { kind: 'same' }
  const anomaly = { kind: 'anomaly', reason: `${state.status}_after_${current}` } as const
  if (target === 'declined' || target === 'voided') {
    return current === 'pending' || current === 'authorized'
      ? { kind: 'move', to: target }
      : anomaly
  }
  if (current === 'voided' && isMoneyState(target)) return { kind: 'move', to: target }
  const from = RANK[current]
  const to = RANK[target]
  if (from === undefined || to === undefined) return anomaly
  if (isMoneyState(current) && target === 'captured') return { kind: 'same' }
  return to > from ? { kind: 'move', to: target } : anomaly
}
