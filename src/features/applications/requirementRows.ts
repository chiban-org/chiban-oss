import type { GateResult } from '@/features/gates/evaluateGates'
import { gateDetail } from '@/features/gates/gateDetail'
import { LICENSE_GATE_KEY } from '@/features/licenseChecks/licenseRules'
import { gateAnchor } from './nextStep'
import type {
  ClosureStage,
  PlanAction,
  PlanActionKind,
  PlanActor,
  Requirement,
} from './workPlanTypes'

interface GateCopy {
  label: string
  task: string
  actor: PlanActor
  action?: Exclude<PlanActionKind, 'move'>
  reinspect?: string
}

const GATE_COPY: ReadonlyMap<string, GateCopy> = new Map([
  [
    'reviews.signed_off',
    {
      label: 'Reviews signed off',
      task: 'Wait for the reviews to be signed off',
      actor: 'reviewers',
    },
  ],
  [
    'nh.bp.code_edition_recorded',
    {
      label: 'Code edition recorded',
      task: 'Record the code edition',
      actor: 'town',
      action: 'record_code_edition',
    },
  ],
  [
    'nh.bp.regional_impact',
    {
      label: 'Regional impact determined',
      task: 'Record the regional impact determination',
      actor: 'town',
      action: 'record_regional_impact',
    },
  ],
  [
    'fees.paid',
    { label: 'Fees paid', task: 'Pay the fees', actor: 'applicant', action: 'record_payment' },
  ],
  [
    'conditions.blocking_met',
    {
      label: 'Conditions that block issuance met',
      task: 'Meet the conditions that block issuance',
      actor: 'applicant',
    },
  ],
  [
    'closure.requirement_met',
    { label: 'Closing requirement met', task: 'Finish the final inspection', actor: 'inspector' },
  ],
  [
    'nh.ri.determination',
    {
      label: 'Regional impact determined',
      task: 'Record the regional impact determination',
      actor: 'town',
      action: 'record_board_regional_impact',
    },
  ],
  [
    'abutters.list_issued',
    {
      label: 'Abutter list issued',
      task: 'Issue the abutter list',
      actor: 'town',
      action: 'open_abutter_list',
    },
  ],
  [
    'nh.pb.abutter_list_fresh',
    {
      label: 'Abutter list drawn within 5 days of filing',
      task: 'Draw a new abutter list',
      actor: 'town',
    },
  ],
  [
    LICENSE_GATE_KEY,
    {
      label: 'State license checked',
      task: "Check the contractor's state license",
      actor: 'town',
      action: 'record_license_check',
    },
  ],
  [
    'nh.appeal.suspension',
    { label: 'Appeal resolved', task: 'Record the appeal outcome', actor: 'town' },
  ],
])

export interface ClosureFacts {
  stage: ClosureStage
  reinspectId: string | null
  dueFinal: boolean
}

export interface RowFacts {
  reviewers: number
  regionalDetermined: boolean
  commissionNotified: boolean
  abilities: ReadonlySet<PlanActionKind>
  closure?: ClosureFacts
}

function adjusted(gate: GateResult, copy: GateCopy, facts: RowFacts): GateCopy {
  if (gate.key === 'reviews.signed_off' && facts.reviewers === 0) {
    return { ...copy, task: 'Assign a reviewer', actor: 'town', action: 'assign_reviewer' }
  }
  if (gate.key === 'nh.bp.regional_impact' && facts.regionalDetermined) {
    const task = facts.commissionNotified
      ? 'Wait for the regional comment period to end'
      : 'Record the certified notice to the regional planning commission'
    return { label: copy.label, task, actor: 'town' }
  }
  if (gate.key === 'closure.requirement_met' && facts.closure !== undefined) {
    return closingCopy(copy, facts.closure)
  }
  return copy
}

function closingCopy(copy: GateCopy, closure: ClosureFacts): GateCopy {
  switch (closure.stage) {
    case 'none':
      return {
        ...copy,
        task: 'Book the final inspection',
        actor: 'town',
        action: 'take_inspection_request',
      }
    case 'failed':
      return {
        ...copy,
        task: 'Book the final reinspection',
        actor: 'town',
        action: 'take_inspection_request',
        reinspect: closure.reinspectId ?? undefined,
      }
    case 'open':
      return closure.dueFinal ? { ...copy, action: 'record_inspection_result' } : copy
    case 'passed':
      return {
        ...copy,
        task: 'Issue the certificate of occupancy',
        actor: 'town',
        action: 'issue_certificate',
      }
  }
}

function planActionOf(copy: GateCopy): PlanAction | null {
  if (copy.action === undefined) return null
  if (copy.action === 'take_inspection_request') {
    return copy.reinspect === undefined
      ? { kind: copy.action }
      : { kind: copy.action, reinspect: copy.reinspect }
  }
  return { kind: copy.action }
}

function reasonOf(gate: GateResult): string {
  return gate.outcome.status === 'pass' ? '' : gateDetail(gate.label, gate.outcome.reason)
}

export function gateRow(gate: GateResult, facts: RowFacts): Requirement {
  const base = GATE_COPY.get(gate.key) ?? { label: gate.label, task: gate.label, actor: 'town' }
  const copy = adjusted(gate, base, facts)
  const done = gate.effective === 'pass'
  const action =
    done || copy.action === undefined || !facts.abilities.has(copy.action)
      ? null
      : planActionOf(copy)
  return {
    key: gate.key,
    label: copy.label,
    done,
    detail: reasonOf(gate),
    task: copy.task,
    actor: copy.actor,
    anchor: gateAnchor(gate.key),
    action,
    gate,
  }
}
