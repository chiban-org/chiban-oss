import type { CaseActionKind, CaseActor, CaseWorkPlan } from '@/features/enforcement/workPlanTypes'
import { boardAbbrev } from '@/features/packs/vocabulary'
import { lowerFirst } from '@/lib/words'

export interface NextStep {
  actor: string
  ask: string
}

function actorLabels(): Readonly<Record<CaseActor, string>> {
  return {
    town: 'Town',
    respondent: 'Respondent',
    zba: boardAbbrev('zba'),
    court: 'Court',
    counsel: 'Town counsel',
  }
}

export const EVERY_CASE_ABILITY: ReadonlySet<CaseActionKind> = new Set([
  'move',
  'record_finding',
  'send_notice',
  'send_cure_notice',
  'place_hold',
  'file_civil_action',
  'record_notice_receipt',
  'draft_order',
  'issue_order',
  'record_role_check',
  'list_recipient',
  'record_service',
  'record_court_step',
  'record_fine_payment',
])

export function nextStepOf(plan: CaseWorkPlan): NextStep | null {
  if (plan.now === null) return null
  const { ask, actor } = plan.now
  return { actor: actorLabels()[actor], ask: lowerFirst(ask) }
}

export function nextStepText(step: NextStep): string {
  return `${step.actor}: ${step.ask}`
}
