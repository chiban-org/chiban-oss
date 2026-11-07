import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { meetingDeadline } from '@/features/applications/meetingDeadline'
import { isTerminalState } from '@/features/applications/states'
import { moveTask } from '@/features/applications/workPlan'
import type { PlanAction } from '@/features/applications/workPlanTypes'
import type { BoardPanelData } from '@/features/boards/panelData'
import { BoardRegionalForm, MeetingForm, VoteFormBody } from './boardForms'
import { CodeEditionForm, RegionalDeterminationForm } from './buildingForms'
import { InspectionResultForm } from './inspectionResultForm'
import { MoveForm } from './nextStepCard'
import type { RecordPanelsInput } from './panelSet'
import { MarkCompleteForm } from './panels'
import { PaymentForm } from './paymentControls'
import { draftAbutterList } from './planAbilities'
import { AssignReviewerForm, offeredReviewers } from './reviewersPanel'

export type PlanFormInput = Pick<
  RecordPanelsInput,
  'view' | 'records' | 'payments' | 'board' | 'due'
>

export function actionSummary(action: PlanAction, input: PlanFormInput): string {
  switch (action.kind) {
    case 'assign_reviewer':
      return 'Assign a reviewer'
    case 'mark_complete':
      return 'Mark complete'
    case 'record_code_edition':
      return 'Record the code edition'
    case 'record_regional_impact':
      return 'Record a determination'
    case 'record_payment':
      return 'Record a cash or check payment'
    case 'set_board_meeting':
      return 'Set the meeting'
    case 'record_board_vote':
      return input.board?.board === 'zba' ? 'Open the hearing' : 'Record the completeness vote'
    case 'record_board_regional_impact':
      return 'Record the regional impact determination'
    case 'open_abutter_list':
      return 'Open the draft abutter list'
    case 'record_inspection_result':
      return 'Record the inspection result'
    case 'move':
      return moveTask(action.to)
  }
}

type Variant = 'default' | 'outline'

function BoardActionForm({
  kind,
  board,
  clocks,
  variant,
}: {
  kind: 'set_board_meeting' | 'record_board_vote' | 'record_board_regional_impact'
  board: BoardPanelData
  clocks: PlanFormInput['view']['clocks']
  variant: Variant
}) {
  if (kind === 'set_board_meeting') {
    return (
      <MeetingForm data={board} deadline={meetingDeadline(clocks, board.board)} variant={variant} />
    )
  }
  if (kind === 'record_board_vote') return <VoteFormBody data={board} variant={variant} />
  return <BoardRegionalForm data={board} variant={variant} />
}

function OpenDraftList({ board, variant }: { board: BoardPanelData; variant: Variant }) {
  const draft = draftAbutterList(board)
  if (draft === null) return null
  return (
    <Button asChild variant={variant} className="self-start">
      <Link
        href={`/staff/abutters/${draft.id}`}
      >{`Open version ${draft.version} to issue it`}</Link>
    </Button>
  )
}

export function PlanActionForm({
  action,
  input,
  primary,
}: {
  action: PlanAction
  input: PlanFormInput
  primary: boolean
}) {
  const variant: Variant = primary ? 'default' : 'outline'
  const { view, records, payments, board, due } = input
  switch (action.kind) {
    case 'assign_reviewer':
      return (
        <AssignReviewerForm
          applicationId={view.id}
          offered={offeredReviewers(records.reviewers, records.choices)}
          variant={variant}
        />
      )
    case 'mark_complete':
      return <MarkCompleteForm view={view} variant={variant} />
    case 'record_code_edition':
      return <CodeEditionForm view={view} variant={variant} />
    case 'record_regional_impact':
      return <RegionalDeterminationForm view={view} variant={variant} />
    case 'record_payment':
      return payments === null ? null : <PaymentForm payments={payments} variant={variant} />
    case 'set_board_meeting':
    case 'record_board_vote':
    case 'record_board_regional_impact':
      return board === null ? null : (
        <BoardActionForm kind={action.kind} board={board} clocks={view.clocks} variant={variant} />
      )
    case 'open_abutter_list':
      return board === null ? null : <OpenDraftList board={board} variant={variant} />
    case 'record_inspection_result':
      return due == null ? null : <InspectionResultForm due={due} number={view.number} />
    case 'move':
      return (
        <MoveForm
          view={view}
          to={action.to}
          label={moveTask(action.to)}
          variant={isTerminalState(action.to) ? 'destructive' : variant}
        />
      )
  }
}
