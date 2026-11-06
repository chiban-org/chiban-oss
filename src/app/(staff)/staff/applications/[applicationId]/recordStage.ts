import { type CoreState, isTerminalState } from '@/features/applications/states'

const REVIEW_STATES: readonly CoreState[] = ['submitted', 'under_review']

export function mayAssignReviewers(state: CoreState): boolean {
  return REVIEW_STATES.includes(state)
}

export function mayAddToRecord(state: CoreState): boolean {
  return !isTerminalState(state)
}
