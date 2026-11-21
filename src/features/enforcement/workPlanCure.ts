import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, compareCivil, daysBetween } from '@/types/civilDate'
import { cureStanding, uncoveredOpenFindings } from './cureStanding'
import { type CasePlanInput, draftOrderOf } from './workPlanInput'
import type { Step } from './workPlanSteps'
import type { CaseAction, CaseDue } from './workPlanTypes'

export function remedyActions(input: CasePlanInput): CaseAction[] {
  const cure = input.cure
  if (cure?.rule == null || input.staff.row.status !== 'violation_found' || input.stay.stayed) {
    return []
  }
  if (!cureStanding(input.findings, cure.notices, input.today).lapsedUncorrected) return []
  return [
    ...(cure.rule.remedies.developmentHold ? [{ kind: 'place_hold' as const }] : []),
    ...(cure.rule.remedies.civilAction ? [{ kind: 'file_civil_action' as const }] : []),
    ...(draftOrderOf(input) === null ? [{ kind: 'draft_order' as const }] : []),
  ]
}

export function cureNoticeSent(input: CasePlanInput): boolean {
  return input.cure?.rule != null && input.cure.notices.length > 0
}

export function cureReceiptRecorded(input: CasePlanInput): boolean {
  return input.cure?.rule != null && input.cure.notices.some((n) => n.returnReceiptOn !== null)
}

export function cureDue(input: CasePlanInput): CaseDue | null {
  const cure = input.cure
  if (cure?.rule == null || input.staff.row.status !== 'violation_found') return null
  const { due } = cureStanding(input.findings, cure.notices, input.today)
  if (due === null || compareCivil(due, input.today) < 0) return null
  if (uncoveredOpenFindings(input.findings, cure.notices).length > 0) return null
  return {
    key: 'cure',
    label: 'Cure period ends',
    date: due,
    daysLeft: daysBetween(input.today, due),
  }
}

export function cureStep(input: CasePlanInput): Step | null {
  const cure = input.cure
  if (cure?.rule == null) return null
  if (uncoveredOpenFindings(input.findings, cure.notices).length > 0) {
    const task = 'Send the cure notice'
    return {
      key: 'cure.sent',
      task,
      ask: task,
      actor: 'town',
      actorName: null,
      note: null,
      action: { kind: 'send_cure_notice' },
    }
  }
  const standing = cureStanding(input.findings, cure.notices, input.today)
  if (standing.lapsedUncorrected) {
    const task = 'Take a remedy for the uncorrected violation'
    return {
      key: 'cure.remedy',
      task,
      ask: task,
      actor: 'town',
      actorName: null,
      note: 'The cure period ran and a noticed violation is still open.',
      action: remedyActions(input)[0] ?? null,
    }
  }
  return {
    key: 'cure.period',
    task: 'Wait for the cure period',
    ask: 'Correct the violation',
    actor: 'respondent',
    actorName: null,
    note: standing.due === null ? null : `Cure period ends ${formatCivilDate(standing.due)}.`,
    action: null,
  }
}
