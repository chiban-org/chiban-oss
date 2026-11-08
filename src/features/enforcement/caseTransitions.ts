import type { EnforcementStatus } from '@/db/schema'

export const CASE_TRANSITIONS: Record<EnforcementStatus, readonly EnforcementStatus[]> = {
  intake: ['investigating'],
  investigating: ['violation_found', 'no_violation'],
  violation_found: ['order_issued', 'resolved', 'no_violation'],
  no_violation: ['closed'],
  order_issued: ['in_court', 'resolved'],
  in_court: ['resolved'],
  resolved: ['closed'],
  closed: [],
}

export const STATUSES_SET_BY_THEIR_STEP: readonly EnforcementStatus[] = ['order_issued', 'in_court']

const FINDING_STATUSES: readonly EnforcementStatus[] = [
  'investigating',
  'violation_found',
  'order_issued',
  'in_court',
]

export function mayRecordFinding(status: EnforcementStatus): boolean {
  return FINDING_STATUSES.includes(status)
}

export function noViolationAllowed(
  from: EnforcementStatus,
  findingStatuses: readonly string[],
): boolean {
  return from !== 'violation_found' || findingStatuses.every((s) => s === 'withdrawn')
}
