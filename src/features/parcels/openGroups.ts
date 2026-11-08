import type { DecisionOutcome } from '@packs/nh/schema'
import type { Role } from '@/constants/roles'
import type { EnforcementStatus, InspectionStatus } from '@/db/schema'
import type { CoreState } from '@/features/applications/states'
import type { Status } from '@/features/design/tokens'

export const OPEN_GROUPS = [
  'case',
  'permit_review',
  'board_review',
  'permit_to_issue',
  'permit_suspended',
  'permit_in_force',
  'board_in_force',
  'inspection_scheduled',
  'inspection_requested',
  'draft',
] as const

export type OpenGroup = (typeof OPEN_GROUPS)[number]

const IN_FORCE: readonly OpenGroup[] = ['permit_in_force', 'board_in_force']

export function isInForce(group: OpenGroup): boolean {
  return IN_FORCE.includes(group)
}

export interface ApplicationStanding {
  state: CoreState
  board: boolean
  approved: boolean
}

const IN_REVIEW: readonly CoreState[] = ['submitted', 'under_review']

function decidedGroup(board: boolean, approved: boolean): OpenGroup {
  if (!board) return 'permit_to_issue'
  return approved ? 'board_in_force' : 'board_review'
}

export function applicationOpenGroup({
  state,
  board,
  approved,
}: ApplicationStanding): OpenGroup | null {
  if (state === 'draft') return 'draft'
  if (IN_REVIEW.includes(state)) return board ? 'board_review' : 'permit_review'
  if (state === 'decided') return decidedGroup(board, approved)
  if (state === 'issued') return board ? 'board_in_force' : 'permit_in_force'
  if (state === 'suspended') return 'permit_suspended'
  return null
}

const OPEN_CASE: readonly EnforcementStatus[] = [
  'intake',
  'investigating',
  'violation_found',
  'order_issued',
  'in_court',
]

export function caseOpenGroup(status: EnforcementStatus): OpenGroup | null {
  return OPEN_CASE.includes(status) ? 'case' : null
}

const FAILED_CASE: readonly EnforcementStatus[] = ['violation_found', 'order_issued', 'in_court']

export function caseChip(status: EnforcementStatus): Status {
  return FAILED_CASE.includes(status) ? 'failed' : 'neutral'
}

export function inspectionOpenGroup(status: InspectionStatus): OpenGroup | null {
  if (status === 'requested') return 'inspection_requested'
  return status === 'scheduled' ? 'inspection_scheduled' : null
}

export const APPROVING_OUTCOMES: readonly DecisionOutcome[] = [
  'approved',
  'approved_with_conditions',
]

const OUTCOME_WORDS = new Map<DecisionOutcome, { label: string; chip: Status }>([
  ['approved', { label: 'Approved', chip: 'passed' }],
  ['approved_with_conditions', { label: 'Approved with conditions', chip: 'passed' }],
  ['denied', { label: 'Denied', chip: 'failed' }],
  ['rehearing_granted', { label: 'Rehearing granted', chip: 'neutral' }],
  ['rehearing_denied', { label: 'Rehearing denied', chip: 'neutral' }],
])

export function decisionOutcome(
  outcome: DecisionOutcome,
  boardKind: string | null,
): { label: string; chip: Status } {
  const words = OUTCOME_WORDS.get(outcome) ?? { label: 'Decided', chip: 'neutral' }
  if (boardKind !== 'zba' || !APPROVING_OUTCOMES.includes(outcome)) return words
  return { ...words, label: words.label.replace('Approved', 'Granted') }
}

export type ParcelView = 'office' | 'field'

export function parcelViewFor(roles: readonly Role[]): ParcelView {
  return roles.includes('inspector') && !roles.includes('staff') ? 'field' : 'office'
}
