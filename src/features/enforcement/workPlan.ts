import type { EnforcementStatus } from '@/db/schema'
import { CASE_TRANSITIONS } from '@/features/enforcement/caseTransitions'
import { daysLeftPhrase } from '@/lib/dayCount'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import {
  type CasePlanExtras,
  type CasePlanInput,
  type CasePlanOrder,
  liveOrder,
  runningAnswers,
  stepOf,
} from './workPlanInput'
import { requirementGroups } from './workPlanRequirements'
import { currentStep, type Step } from './workPlanSteps'
import type { CaseDue, CaseMove, CaseNowStep, CaseWorkPlan } from './workPlanTypes'

export type { CasePlanExtras, CasePlanInput, CasePlanOrder }

const OUTCOMES: ReadonlyMap<EnforcementStatus, string> = new Map([
  ['closed', 'This case is closed.'],
  ['no_violation', 'No violation was found.'],
])

const MOVES: readonly CaseMove[] = ['investigating', 'no_violation', 'resolved', 'closed']
const DUE_STATUSES: readonly EnforcementStatus[] = ['order_issued', 'in_court']

function dueAt(key: CaseDue['key'], label: string, date: string, today: CivilDate): CaseDue {
  return { key, label, date: date as CivilDate, daysLeft: daysBetween(today, date as CivilDate) }
}

function orderDue(order: CasePlanOrder, today: CivilDate): CaseDue | null {
  const answer = runningAnswers(order, today)[0]
  if (answer !== undefined) return dueAt('answer', 'Answer due', answer.due.due, today)
  if (order.appealDue !== null && order.appealDue.due >= today) {
    return dueAt('judgment_appeal', 'Appeal of the judgment due', order.appealDue.due, today)
  }
  if (stepOf(order, 'judgment') !== null || order.row.correctiveDeadline === null) return null
  return dueAt('corrective_action', 'Corrective action due', order.row.correctiveDeadline, today)
}

export function caseDue(input: CasePlanInput): CaseDue | null {
  if (input.stay.stayed || !DUE_STATUSES.includes(input.staff.row.status)) return null
  const order = liveOrder(input)
  return order === null ? null : orderDue(order, input.today)
}

export function duePhrase(due: CaseDue): string {
  return `${due.label} ${formatCivilDate(due.date)}, ${daysLeftPhrase(due.daysLeft)}.`
}

function actorLabel(step: Step, responsible: string | null): string {
  switch (step.actor) {
    case 'town':
      return responsible === null ? 'Town' : `Town (${responsible})`
    case 'respondent':
      return step.actorName === null ? 'Respondent' : `Respondent (${step.actorName})`
    case 'zba':
      return 'Zoning Board of Adjustment'
    case 'court':
      return 'Court'
    case 'counsel':
      return 'Town counsel'
  }
}

function sentenceOf(
  status: EnforcementStatus,
  step: Step | null,
  due: CaseDue | null,
  responsible: string | null,
): string {
  const outcome = OUTCOMES.get(status)
  if (outcome !== undefined) return outcome
  const waiting =
    step === null
      ? 'Nothing is waiting on anyone.'
      : `Waiting on: ${actorLabel(step, responsible)}. ${step.ask}.`
  return due === null ? waiting : `${waiting} ${duePhrase(due)}`
}

function allowed(step: Step | null, extras: CasePlanExtras): Step | null {
  if (step?.action == null || extras.abilities.has(step.action.kind)) return step
  return { ...step, action: null, note: 'Your role cannot take this step.' }
}

function nowOf(step: Step | null, input: CasePlanInput): CaseNowStep | null {
  if (step === null) return null
  const warnings = input.banner === null ? [] : [{ key: 'stay', text: input.banner }]
  return { ...step, warnings }
}

function movesOf(input: CasePlanInput, now: CaseNowStep | null, extras: CasePlanExtras) {
  if (!extras.abilities.has('move')) return []
  const inCard = now?.action?.kind === 'move' ? now.action.to : null
  return CASE_TRANSITIONS[input.staff.row.status].filter(
    (to): to is CaseMove => (MOVES as readonly string[]).includes(to) && to !== inCard,
  )
}

export function planCaseWork(input: CasePlanInput, extras: CasePlanExtras): CaseWorkPlan {
  const status = input.staff.row.status
  const step = currentStep(input)
  const due = caseDue(input)
  const now = nowOf(allowed(step, extras), input)
  return {
    status,
    stayed: input.stay.stayed,
    sentence: sentenceOf(status, step, due, extras.responsible),
    now,
    due,
    groups: requirementGroups(input),
    moves: movesOf(input, now, extras),
  }
}
