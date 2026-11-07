import type { GateResult } from '@/features/gates/evaluateGates'
import { gateDetail } from '@/features/gates/gateDetail'
import { gateAnchor } from './nextStep'
import type { PlanActionKind, PlanActor, Requirement } from './workPlanTypes'

interface GateCopy {
  label: string
  task: string
  actor: PlanActor
  action?: Exclude<PlanActionKind, 'move'>
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
    'nh.appeal.suspension',
    { label: 'Appeal resolved', task: 'Record the appeal outcome', actor: 'town' },
  ],
])

export interface RowFacts {
  reviewers: number
  regionalDetermined: boolean
  commissionNotified: boolean
  abilities: ReadonlySet<PlanActionKind>
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
  if (gate.key === 'closure.requirement_met' && /certificate/i.test(reasonOf(gate))) {
    return { ...copy, task: 'Issue the certificate of occupancy', actor: 'town' }
  }
  return copy
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
      : { kind: copy.action }
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
