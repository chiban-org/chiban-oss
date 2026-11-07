import type { BoardPanelData } from '@/features/boards/panelData'
import type { GateResult } from '@/features/gates/evaluateGates'
import type { CoreState } from './states'

export type PlanBoard = Pick<
  BoardPanelData,
  | 'board'
  | 'boardName'
  | 'acceptanceMeetingId'
  | 'acceptanceDate'
  | 'acceptanceText'
  | 'meetings'
  | 'today'
>

export type PlanActor = 'town' | 'applicant' | 'reviewers' | 'board' | 'inspector'

export type PlanAction =
  | { kind: 'assign_reviewer' }
  | { kind: 'mark_complete' }
  | { kind: 'record_code_edition' }
  | { kind: 'record_regional_impact' }
  | { kind: 'record_payment' }
  | { kind: 'set_board_meeting' }
  | { kind: 'record_board_vote' }
  | { kind: 'record_board_regional_impact' }
  | { kind: 'move'; to: CoreState }

export type PlanActionKind = PlanAction['kind']

export interface Requirement {
  key: string
  label: string
  done: boolean
  detail: string
  task: string
  actor: PlanActor
  anchor: string
  action: PlanAction | null
  gate: GateResult | null
}

export interface RequirementGroup {
  to: CoreState
  title: string
  rows: Requirement[]
}

export interface PlanWarning {
  key: string
  text: string
}

export interface NowStep {
  key: string
  task: string
  actor: PlanActor
  note: string | null
  action: PlanAction | null
  secondary: PlanAction[]
  warnings: PlanWarning[]
}

export interface WorkPlan {
  state: CoreState
  sentence: string
  now: NowStep | null
  groups: RequirementGroup[]
  terminal: CoreState[]
}

export function addWarning(plan: WorkPlan, warning: PlanWarning): WorkPlan {
  if (plan.now === null) return plan
  return { ...plan, now: { ...plan.now, warnings: [...plan.now.warnings, warning] } }
}

export function addRequirement(
  plan: WorkPlan,
  group: Pick<RequirementGroup, 'to' | 'title'>,
  row: Requirement,
): WorkPlan {
  const found = plan.groups.some((g) => g.to === group.to)
  const groups = found
    ? plan.groups.map((g) => (g.to === group.to ? { ...g, rows: [...g.rows, row] } : g))
    : [...plan.groups, { ...group, rows: [row] }]
  return { ...plan, groups }
}

export function hostedActions(plan: WorkPlan): Set<PlanActionKind> {
  const rows = plan.groups.flatMap((g) => g.rows).filter((r) => !r.done)
  const actions = [plan.now?.action ?? null, ...rows.map((r) => r.action)]
  return new Set(actions.filter((a) => a !== null && a.kind !== 'move').map((a) => a.kind))
}
