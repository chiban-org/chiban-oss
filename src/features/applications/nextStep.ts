import type { GateResult } from '@/features/gates/evaluateGates'
import type { CoreState } from './states'

export const TERMINAL_MOVES: readonly CoreState[] = ['withdrawn', 'denied', 'closed', 'expired']

const GATE_PANELS: ReadonlyMap<string, string> = new Map([
  ['fees.paid', 'fees-and-payments'],
  ['conditions.blocking_met', 'conditions'],
  ['closure.requirement_met', 'inspections'],
  ['reviews.signed_off', 'reviewers'],
  ['nh.bp.code_edition_recorded', 'code-edition'],
  ['nh.bp.regional_impact', 'regional-impact'],
  ['nh.appeal.suspension', 'appeals'],
  ['nh.ri.determination', 'board'],
  ['nh.pb.abutter_list_fresh', 'board'],
  ['abutters.list_issued', 'board'],
])

export function gateAnchor(key: string): string {
  return GATE_PANELS.get(key) ?? 'gates'
}

export interface Blocker {
  key: string
  label: string
  reason: string
  anchor: string
}

export interface NextStepPlan {
  lead: { to: CoreState; blockers: Blocker[] } | null
  primary: CoreState | null
  secondary: CoreState[]
  terminal: CoreState[]
}

type GateGroup = { to: CoreState; results: GateResult[] }

function blockersOf(gates: readonly GateGroup[], to: CoreState): Blocker[] {
  const results = gates.find((g) => g.to === to)?.results ?? []
  return results
    .filter((r) => r.effective === 'blocked')
    .map((r) => ({
      key: r.key,
      label: r.label,
      reason: r.outcome.status === 'pass' ? '' : r.outcome.reason,
      anchor: gateAnchor(r.key),
    }))
}

function leadingMove(forward: CoreState[], terminal: CoreState[]): CoreState | null {
  return forward[0] ?? (terminal.includes('closed') ? 'closed' : null)
}

export function planNextStep(
  transitions: readonly CoreState[],
  gates: readonly GateGroup[],
): NextStepPlan {
  const forward = transitions.filter((to) => !TERMINAL_MOVES.includes(to))
  const terminal = transitions.filter((to) => TERMINAL_MOVES.includes(to))
  const leadTo = leadingMove(forward, terminal)
  const lead = leadTo === null ? null : { to: leadTo, blockers: blockersOf(gates, leadTo) }
  const primary =
    lead !== null && lead.blockers.length === 0 && !TERMINAL_MOVES.includes(lead.to)
      ? lead.to
      : null
  return {
    lead,
    primary,
    secondary: forward.filter((to) => to !== leadTo && blockersOf(gates, to).length === 0),
    terminal,
  }
}
