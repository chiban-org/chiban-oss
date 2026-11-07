import type { CaseActionKind } from '@/features/enforcement/workPlanTypes'
import type { Can } from './can'

export function caseAbilities(can: Can): Set<CaseActionKind> {
  const granted: [CaseActionKind, boolean][] = [
    ['move', can.manage],
    ['record_finding', can.manage],
    ['send_notice', can.manage],
    ['record_notice_receipt', can.manage],
    ['draft_order', can.manage],
    ['issue_order', can.issue],
    ['record_role_check', can.service],
    ['list_recipient', can.service],
    ['record_service', can.service],
    ['record_court_step', can.service],
    ['record_fine_payment', can.collect],
  ]
  return new Set(granted.filter(([, allowed]) => allowed).map(([kind]) => kind))
}
