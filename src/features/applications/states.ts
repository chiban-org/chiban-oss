export const CORE_STATES = [
  'draft',
  'submitted',
  'under_review',
  'decided',
  'issued',
  'closed',
  'denied',
  'withdrawn',
  'expired',
  'suspended',
] as const

export type CoreState = (typeof CORE_STATES)[number]

export const TERMINAL_STATES: readonly CoreState[] = ['closed', 'denied', 'withdrawn', 'expired']

export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.some((terminal) => terminal === state)
}

export const STATE_LABELS: Record<CoreState, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  decided: 'Decided',
  issued: 'Issued',
  closed: 'Closed',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  suspended: 'Suspended',
}

export const CORE_TRANSITIONS: Record<CoreState, readonly CoreState[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'issued', 'denied', 'withdrawn'],
  under_review: ['decided', 'denied', 'withdrawn'],
  decided: ['issued', 'expired', 'withdrawn'],
  issued: ['closed', 'expired', 'suspended'],
  suspended: ['issued', 'closed'],
  closed: [],
  denied: [],
  withdrawn: [],
  expired: [],
}

export function isTransitionAllowed(
  from: CoreState,
  to: CoreState,
  workflow: { allowsDirectIssue: boolean },
): boolean {
  if (!CORE_TRANSITIONS[from].includes(to)) return false
  return !(from === 'submitted' && to === 'issued' && !workflow.allowsDirectIssue)
}
