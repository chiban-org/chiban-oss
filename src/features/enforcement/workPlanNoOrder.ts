import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { type CasePlanInput, counselState } from './workPlanInput'
import type { CaseAction, CaseActor, CaseNowStep } from './workPlanTypes'

export type Step = Omit<CaseNowStep, 'warnings'>

export function town(
  key: string,
  task: string,
  action: CaseAction | null,
  note: string | null = null,
) {
  return { key, task, ask: task, actor: 'town' as const, actorName: null, note, action }
}

interface Waiting {
  key: string
  actor: CaseActor
  ask: string
  task: string
  note?: string | null
}

export function waiting(w: Waiting): Step {
  return { ...w, actorName: null, note: w.note ?? null, action: null }
}

export function holdReleaseStep(ending: 'resolving' | 'closing'): Step {
  return town(
    'hold.release',
    'Release the hold',
    null,
    `Release it under Development hold before ${ending} the case.`,
  )
}

export function holdActive(input: Pick<CasePlanInput, 'cure'>): boolean {
  return input.cure?.holdPlaced === true
}

export function resolveStep(input: Pick<CasePlanInput, 'cure'>): Step {
  if (holdActive(input)) return holdReleaseStep('resolving')
  return town('move:resolved', 'Resolve the case', { kind: 'move', to: 'resolved' })
}

export function judgmentStep(input: CasePlanInput): Step {
  const owed = input.fines.find((f) => f.dueCents > 0)
  if (owed === undefined) return resolveStep(input)
  return town('fines.paid', `Collect the ${formatCents(owed.dueCents)} fine balance`, {
    kind: 'record_fine_payment',
    fineId: owed.row.id,
  })
}

export function noOrderCounselStep(input: CasePlanInput): Step {
  const counsel = counselState(input)
  if (counsel === 'won') return judgmentStep(input)
  if (counsel === 'ended') return resolveStep(input)
  if (counsel === 'open') {
    return waiting({
      key: 'counsel.referred',
      actor: 'counsel',
      ask: 'Take the case to court',
      task: 'Wait for town counsel',
    })
  }
  return town('counsel.referred', 'Refer the case to town counsel', null)
}

function latestCorrectBy(input: CasePlanInput): CivilDate | null {
  const dates = input.notices
    .map((n) => n.correctBy ?? null)
    .filter((d): d is string => d !== null) as CivilDate[]
  return dates.reduce<CivilDate | null>(
    (latest, d) => (latest === null || compareCivil(d, latest) > 0 ? d : latest),
    null,
  )
}

export function correctionWaitStep(input: CasePlanInput): Step | null {
  const correctBy = latestCorrectBy(input)
  if (correctBy === null || compareCivil(correctBy, input.today) <= 0) return null
  return waiting({
    key: 'notice.correct_by',
    actor: 'respondent',
    ask: 'Correct the violation',
    task: `Wait for the correction date, ${formatCivilDate(correctBy)}`,
  })
}
