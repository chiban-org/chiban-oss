import { dueNext } from '@/features/clocks/clockSummary'
import type { ClockExplanation } from '@/features/clocks/explainClock'
import { daysLeftPhrase } from '@/lib/dayCount'
import { formatCivilDate } from '@/lib/formatDate'
import type { CoreState } from './states'
import type { NowStep, PlanActor } from './workPlanTypes'

const OUTCOMES: ReadonlyMap<CoreState, string> = new Map([
  ['closed', 'This permit is closed.'],
  ['denied', 'This application was denied.'],
  ['withdrawn', 'This application was withdrawn.'],
  ['expired', 'This permit expired.'],
])

export const DRAFT_SENTENCE = 'Waiting on the applicant to submit.'

interface Names {
  board: string | null
  responsible: string | null
}

function actorLabel(actor: PlanActor, names: Names): string {
  if (actor === 'town') return names.responsible === null ? 'Town' : `Town (${names.responsible})`
  if (actor === 'board') return names.board ?? 'The board'
  if (actor === 'applicant') return 'Applicant'
  if (actor === 'reviewers') return 'Reviewers'
  return 'Inspector'
}

type Clock = Pick<ClockExplanation, 'status' | 'daysRemaining' | 'ruleLabel' | 'currentDue'>

export function duePhrase(clocks: readonly Clock[]): string | null {
  const clock = dueNext(clocks)
  if (clock === null) return null
  const left = daysLeftPhrase(clock.daysRemaining)
  return `${clock.ruleLabel}: ${formatCivilDate(clock.currentDue.value)}, ${left}.`
}

export function workSentence(
  view: { state: CoreState; clocks: readonly Clock[] },
  now: NowStep | null,
  names: Names,
): string {
  const outcome = OUTCOMES.get(view.state)
  if (outcome !== undefined) return outcome
  if (view.state === 'draft') return DRAFT_SENTENCE
  const due = duePhrase(view.clocks)
  const waiting =
    now === null
      ? 'Nothing is waiting on anyone.'
      : `Waiting on: ${actorLabel(now.actor, names)}. ${now.task}.`
  return due === null ? waiting : `${waiting} ${due}`
}
