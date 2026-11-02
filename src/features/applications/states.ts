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
