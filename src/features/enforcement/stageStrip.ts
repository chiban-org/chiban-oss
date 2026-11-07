import type { Stage } from '@/components/layout/StageStrip'
import type { EnforcementStatus } from '@/db/schema'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'

export interface CaseStageInput {
  status: EnforcementStatus
  stayed: boolean
  violationFound: boolean
  orderIssued: boolean
  inCourt: boolean
  overdue: boolean
}

const PATH: readonly EnforcementStatus[] = [
  'intake',
  'investigating',
  'violation_found',
  'order_issued',
  'in_court',
  'resolved',
  'closed',
]

const NAMES = new Map<string, string>([
  ...Object.entries(CASE_STATUS_LABELS),
  ['investigating', 'Investigating'],
])

function stage(key: EnforcementStatus | 'stayed', status: Stage['status'], overdue = false): Stage {
  return { key, label: NAMES.get(key) ?? 'Stayed', status, overdue }
}

function rank(status: EnforcementStatus): number {
  return PATH.indexOf(status)
}

function noViolationStages(input: CaseStageInput): Stage[] {
  const ended = input.status === 'closed'
  return [
    stage('intake', 'done'),
    stage('investigating', 'done'),
    stage('no_violation', ended ? 'done' : 'current'),
    ...(ended ? [stage('closed', 'done')] : []),
  ]
}

function skipped(input: CaseStageInput, status: EnforcementStatus): boolean {
  const reached = status === 'order_issued' ? input.orderIssued : input.inCourt
  const optional = status === 'order_issued' || status === 'in_court'
  return optional && !reached && rank(input.status) > rank(status)
}

function withStay(stages: Stage[]): Stage[] {
  const at = stages.findIndex((s) => s.status === 'current')
  const reached = stages.at(at)
  if (at === -1 || reached === undefined) return stages
  return [
    ...stages.slice(0, at),
    { ...reached, status: 'done', overdue: false },
    stage('stayed', 'current'),
    ...stages.slice(at + 1),
  ]
}

export function caseStages(input: CaseStageInput): Stage[] {
  const noViolation =
    input.status === 'no_violation' || (input.status === 'closed' && !input.violationFound)
  if (noViolation) return noViolationStages(input)
  const path = PATH.filter((s) => !skipped(input, s))
  const at = path.indexOf(input.status)
  const closed = input.status === 'closed'
  const stages = path.map((s, index) => {
    if (closed || index < at) return stage(s, 'done')
    return index === at ? stage(s, 'current', input.overdue) : stage(s, 'upcoming')
  })
  return input.stayed && !closed ? withStay(stages) : stages
}
