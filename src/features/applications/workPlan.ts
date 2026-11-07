import { boardMeetingRow, boardVoteRow, meetingStep } from './boardRequirements'
import { meetingConflict, meetingDeadline } from './meetingDeadline'
import { type NextStepPlan, planNextStep } from './nextStep'
import { gateRow, type RowFacts } from './requirementRows'
import type { StaffApplicationView } from './staffApplicationView'
import { type CoreState, isTerminalState } from './states'
import { requirementTargets } from './workPath'
import {
  addWarning,
  type InspectionStep,
  type NowStep,
  type PlanAction,
  type PlanActionKind,
  type PlanBoard,
  type Requirement,
  type RequirementGroup,
  type WorkPlan,
} from './workPlanTypes'

import { workSentence } from './workSentence'

export type PlanView = Pick<
  StaffApplicationView,
  | 'state'
  | 'classification'
  | 'completedDate'
  | 'nextTransitions'
  | 'allowedMoves'
  | 'gates'
  | 'gatesAhead'
  | 'allowsDirectIssue'
  | 'clocks'
  | 'regionalImpact'
>

export interface WorkPlanExtras {
  reviewers: number
  abilities: ReadonlySet<PlanActionKind>
  responsible: string | null
  inspection?: InspectionStep | null
}

const MOVE_TASKS: ReadonlyMap<CoreState, string> = new Map([
  ['under_review', 'Start the review'],
  ['decided', 'Record the decision'],
  ['issued', 'Issue the permit'],
  ['closed', 'Close the permit'],
  ['denied', 'Deny the application'],
  ['withdrawn', 'Withdraw the application'],
])

export function moveTask(to: CoreState): string {
  return MOVE_TASKS.get(to) ?? to
}

function groupTitle(to: CoreState, board: boolean): string {
  if (to === 'under_review') return board ? 'Before the hearing' : 'Before review starts'
  if (to === 'decided') return 'Before the decision'
  if (to === 'issued') return 'Before it can be issued'
  return 'Before it can be closed'
}

const COMPLETENESS_STATES: readonly CoreState[] = ['submitted', 'under_review']

function completenessRow(view: PlanView, extras: WorkPlanExtras): Requirement | null {
  if (view.classification !== 'nh.building_permit' || view.completedDate !== null) return null
  if (!COMPLETENESS_STATES.includes(view.state)) return null
  return {
    key: 'completeness',
    label: 'Marked complete',
    done: false,
    detail: 'The decision clock starts when the application is marked complete.',
    task: 'Mark the application complete',
    actor: 'town',
    anchor: 'completeness',
    action: extras.abilities.has('mark_complete') ? { kind: 'mark_complete' } : null,
    gate: null,
  }
}

function groupOrder(view: PlanView, board: boolean, moves: NextStepPlan): CoreState[] {
  const targets = requirementTargets(view.state, view, board)
  const lead = moves.lead?.to
  const extra =
    lead !== undefined && !targets.includes(lead) && !isTerminalState(lead) ? [lead] : []
  return [...extra, ...targets]
}

function groupRows(view: PlanView, board: PlanBoard | null, to: CoreState, extras: WorkPlanExtras) {
  const facts: RowFacts = {
    reviewers: extras.reviewers,
    regionalDetermined: view.regionalImpact.determination !== null,
    commissionNotified: view.regionalImpact.notices.some(
      (n) => n.recipientKind === 'regional_planning_commission' && n.method === 'certified_mail',
    ),
    abilities: extras.abilities,
  }
  const results = [...view.gates, ...view.gatesAhead].find((g) => g.to === to)?.results ?? []
  const rows = results.map((gate) => gateRow(gate, facts))
  if (board === null || view.state !== 'submitted' || to !== 'under_review') return rows
  const unmet = rows.some((r) => !r.done)
  return [
    boardMeetingRow(board, extras.abilities),
    ...rows,
    boardVoteRow(board, extras.abilities, unmet),
  ]
}

function buildGroups(
  view: PlanView,
  board: PlanBoard | null,
  moves: NextStepPlan,
  extras: WorkPlanExtras,
): RequirementGroup[] {
  const order = groupOrder(view, board !== null, moves)
  const complete = completenessRow(view, extras)
  return order
    .map((to, index) => ({
      to,
      title: groupTitle(to, board !== null),
      rows: [
        ...(index === 0 && complete !== null ? [complete] : []),
        ...groupRows(view, board, to, extras),
      ],
    }))
    .filter((group) => group.rows.length > 0)
}

function stepFrom(row: Requirement, secondary: PlanAction[]): NowStep {
  const note = row.detail === '' ? null : row.detail
  return {
    key: row.key,
    task: row.task,
    actor: row.actor,
    note,
    action: row.action,
    secondary,
    warnings: [],
  }
}

function moveStep(moves: NextStepPlan, secondary: PlanAction[]): NowStep | null {
  if (moves.lead === null) return null
  const { to } = moves.lead
  const step = {
    key: `move:${to}`,
    task: moveTask(to),
    actor: 'town' as const,
    secondary,
    warnings: [],
  }
  return moves.leadAllowed
    ? { ...step, note: null, action: { kind: 'move', to } }
    : { ...step, note: 'Your role cannot make this move.', action: null }
}

function nowStep(
  view: PlanView,
  board: PlanBoard | null,
  groups: RequirementGroup[],
  moves: NextStepPlan,
): NowStep | null {
  if (view.state === 'draft' || isTerminalState(view.state)) return null
  const secondary = moves.secondary.map((to): PlanAction => ({ kind: 'move', to }))
  const leadTo = board !== null && view.state === 'submitted' ? 'under_review' : moves.lead?.to
  const first = groups.find((g) => g.to === leadTo)?.rows.find((r) => !r.done)
  if (first !== undefined) return stepFrom(first, secondary)
  if (board !== null && view.state === 'under_review') {
    return {
      key: 'board.hearing',
      task: 'Hold the hearing and record the decision',
      actor: 'board',
      note: null,
      action: null,
      secondary,
      warnings: [],
    }
  }
  return moveStep(moves, secondary)
}

function inspectionNow(now: NowStep | null, extras: WorkPlanExtras): NowStep | null {
  const step = extras.inspection
  if (now === null || step == null || !extras.abilities.has('record_inspection_result')) return now
  return {
    key: 'inspection.result',
    task: step.task,
    actor: 'inspector',
    note: step.note,
    action: { kind: 'record_inspection_result' },
    secondary: now.secondary,
    warnings: now.warnings,
  }
}

export function planWork(
  view: PlanView,
  board: PlanBoard | null,
  extras: WorkPlanExtras,
): WorkPlan {
  const moves = planNextStep(view.nextTransitions, view.gates, view.allowedMoves)
  const groups = buildGroups(view, board, moves, extras)
  const conflict =
    board === null || view.state !== 'submitted'
      ? null
      : meetingConflict(board, meetingDeadline(view.clocks, board.board))
  const now = inspectionNow(
    meetingStep(nowStep(view, board, groups, moves), board, conflict, extras.abilities),
    extras,
  )
  const inCard = now?.action?.kind === 'move' ? now.action.to : null
  const plan: WorkPlan = {
    state: view.state,
    sentence:
      now?.key === 'inspection.result' && extras.inspection != null
        ? extras.inspection.sentence
        : workSentence(view, now, {
            board: board?.boardName ?? null,
            responsible: extras.responsible,
          }),
    now,
    groups,
    terminal: moves.terminal.filter((to) => to !== inCard),
  }
  return conflict === null
    ? plan
    : addWarning(plan, { key: 'board.meeting.deadline', text: conflict.warning })
}
