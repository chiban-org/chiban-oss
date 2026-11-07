import type { CaseActionKind, CaseActor, CaseWorkPlan } from '@/features/enforcement/workPlanTypes'

export interface NextStep {
  actor: string
  ask: string
}

const ACTOR_LABELS: Readonly<Record<CaseActor, string>> = {
  town: 'Town',
  respondent: 'Respondent',
  zba: 'ZBA',
  court: 'Court',
  counsel: 'Town counsel',
}

export const EVERY_CASE_ABILITY: ReadonlySet<CaseActionKind> = new Set([
  'move',
  'record_finding',
  'send_notice',
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
  return { actor: ACTOR_LABELS[actor], ask: ask.charAt(0).toLowerCase() + ask.slice(1) }
}

export function nextStepText(step: NextStep): string {
  return `${step.actor}: ${step.ask}`
}
