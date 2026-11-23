import type { GateResult } from '@/features/gates/evaluateGates'
import { gateDetail } from '@/features/gates/gateDetail'
import { LICENSE_GATE_KEY } from '@/features/licenseChecks/licenseRules'
import { keyedByRole, packRoles } from '@/features/packs/roles'
import { type CoreState, TERMINAL_STATES } from './states'

function gatePanels(): ReadonlyMap<string, string> {
  const { rules, gates } = packRoles()
  return keyedByRole([
    ['fees.paid', 'fees-and-payments'],
    ['conditions.blocking_met', 'conditions'],
    ['closure.requirement_met', 'inspections'],
    ['reviews.signed_off', 'reviewers'],
    [rules.codeEditionGate, 'code-edition'],
    [rules.regionalImpactGate, 'regional-impact'],
    [rules.appealSuspension, 'appeals'],
    [rules.regionalImpactDetermination, 'board'],
    [gates.abutterListFresh, 'board'],
    ['abutters.list_issued', 'board'],
    [LICENSE_GATE_KEY, 'license-check'],
  ])
}

export function gateAnchor(key: string): string {
  return gatePanels().get(key) ?? 'requirements'
}

export interface Blocker {
  key: string
  label: string
  reason: string
  anchor: string
}

export interface NextStepPlan {
  lead: { to: CoreState; blockers: Blocker[] } | null
  leadAllowed: boolean
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
      reason: r.outcome.status === 'pass' ? '' : gateDetail(r.label, r.outcome.reason),
      anchor: gateAnchor(r.key),
    }))
}

function leadingMove(forward: CoreState[], terminal: CoreState[]): CoreState | null {
  return forward[0] ?? (terminal.includes('closed') ? 'closed' : null)
}

export function planNextStep(
  transitions: readonly CoreState[],
  gates: readonly GateGroup[],
  allowed: readonly CoreState[] = transitions,
): NextStepPlan {
  const may = (to: CoreState) => allowed.includes(to)
  const forward = transitions.filter((to) => !TERMINAL_STATES.includes(to))
  const terminal = transitions.filter((to) => TERMINAL_STATES.includes(to))
  const leadTo = leadingMove(forward, terminal)
  const lead = leadTo === null ? null : { to: leadTo, blockers: blockersOf(gates, leadTo) }
  const leadAllowed = leadTo !== null && may(leadTo)
  const primary =
    lead !== null && leadAllowed && lead.blockers.length === 0 && !TERMINAL_STATES.includes(lead.to)
      ? lead.to
      : null
  return {
    lead,
    leadAllowed,
    primary,
    secondary: forward.filter(
      (to) => to !== leadTo && may(to) && blockersOf(gates, to).length === 0,
    ),
    terminal: terminal.filter((to) => may(to) && blockersOf(gates, to).length === 0),
  }
}
