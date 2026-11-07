import { StageStrip } from '@/components/layout/StageStrip'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { type StageInput, stagesFor } from '@/features/applications/stageStrip'
import type { WorkPlan } from '@/features/applications/workPlanTypes'
import { overdueCount } from '@/features/clocks/clockSummary'
import type { Status } from '@/features/design/tokens'
import { lateNotice } from '@/features/hearings/noticeDeadlines'

function isLate(view: StaffApplicationView): boolean {
  return overdueCount(view.clocks) > 0 || lateNotice(view.noticeDeadlines) !== null
}

export function headerStatus(view: StaffApplicationView): Status {
  const status = applicationChipStatus(view.state)
  return isLate(view) && status !== 'failed' ? 'overdue' : status
}

function stageInput(view: StaffApplicationView, board: boolean): StageInput {
  return {
    state: view.state,
    substep: view.substep,
    board,
    allowsDirectIssue: view.allowsDirectIssue,
    completeness: view.classification === 'nh.building_permit',
    receivedDate: view.receivedDate,
    completedDate: view.completedDate,
    issuedOn: view.issuedOn,
    overdue: isLate(view),
  }
}

export function StageSummary({
  view,
  sentence,
  board,
}: {
  view: StaffApplicationView
  sentence: string
  board: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <p data-slot="status-sentence" className="max-w-[75ch]">
        {sentence}
      </p>
      <StageStrip stages={stagesFor(stageInput(view, board))} />
    </div>
  )
}

export function RecordSummary({
  view,
  plan,
  board,
}: {
  view: StaffApplicationView
  plan: WorkPlan
  board: boolean
}) {
  return <StageSummary view={view} sentence={plan.sentence} board={board} />
}
