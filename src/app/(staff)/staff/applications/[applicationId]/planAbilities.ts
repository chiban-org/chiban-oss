import { meetingIsAhead } from '@/features/applications/boardRequirements'
import type { PlanActionKind } from '@/features/applications/workPlanTypes'
import type { BoardPanelData } from '@/features/boards/panelData'
import { codeEditionEditable, regionalImpactEditable } from './buildingForms'
import type { RecordPanelsInput } from './panelSet'
import { completenessApplies } from './panels'
import { mayRecordPayment } from './paymentControls'
import { mayAssignReviewers } from './recordStage'
import { offeredReviewers } from './reviewersPanel'

function boardAbilities(board: BoardPanelData | null): PlanActionKind[] {
  if (board === null) return []
  const filing = board.canRecord && board.state === 'submitted'
  return [
    ...(filing ? (['set_board_meeting'] as const) : []),
    ...(filing && board.acceptanceMeetingId !== null && !meetingIsAhead(board)
      ? (['record_board_vote'] as const)
      : []),
    ...(board.canDetermine ? (['record_board_regional_impact'] as const) : []),
  ]
}

export function abilitiesOf(input: RecordPanelsInput): Set<PlanActionKind> {
  const { view, records, payments, board } = input
  const assign =
    records.canAssign &&
    mayAssignReviewers(view.state) &&
    offeredReviewers(records.reviewers, records.choices).length > 0
  const granted: [PlanActionKind, boolean][] = [
    ['assign_reviewer', assign],
    ['mark_complete', completenessApplies(view)],
    ['record_code_edition', codeEditionEditable(view)],
    ['record_regional_impact', regionalImpactEditable(view)],
    ['record_payment', mayRecordPayment(payments)],
  ]
  return new Set([
    ...granted.filter(([, allowed]) => allowed).map(([kind]) => kind),
    ...boardAbilities(board),
  ])
}
