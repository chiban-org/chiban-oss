import { meetingIsAhead } from '@/features/applications/boardRequirements'
import type { MeetingDeadline } from '@/features/applications/meetingDeadline'
import type { PlanActionKind } from '@/features/applications/workPlanTypes'
import type { BoardPanelData } from '@/features/boards/panelData'
import { DecisionSection } from './boardDecisionSection'
import { MeetingForm, VoteFormBody } from './boardForms'
import { CostSection, DeterminationSection, ListSection } from './boardPanelSections'

export function VoteForm({ data }: { data: BoardPanelData }) {
  return (
    <details>
      <summary>
        {data.board === 'planning_board' ? 'Record the completeness vote' : 'Open the hearing'}
      </summary>
      <VoteFormBody data={data} />
    </details>
  )
}

const FILING_STATES: readonly string[] = ['draft', 'submitted']

function acceptanceSummary(data: BoardPanelData, hearings: readonly string[]): string {
  const planning = data.board === 'planning_board'
  if (!planning && hearings.length > 0)
    return 'The hearings are listed under Hearings and decisions.'
  if (data.acceptanceText === null) {
    return planning ? 'No acceptance meeting is set.' : 'No hearing is scheduled.'
  }
  return `${planning ? 'Acceptance meeting' : 'Hearing meeting'}: ${data.acceptanceText}.`
}

interface Hosted {
  hosted: ReadonlySet<PlanActionKind>
}

interface Reconciled {
  deadline: MeetingDeadline | null
  voteBlocked: boolean
}

function AcceptanceSection({
  data,
  hearings,
  hosted,
  deadline,
  voteBlocked,
}: { data: BoardPanelData; hearings: string[] } & Hosted & Reconciled) {
  const planning = data.board === 'planning_board'
  const open = data.canRecord && data.state === 'submitted'
  const voteReady = data.acceptanceMeetingId !== null && !meetingIsAhead(data) && !voteBlocked
  return (
    <section aria-label={planning ? 'Acceptance' : 'Hearing'}>
      <h3>{planning ? 'Filing and acceptance' : 'Hearing'}</h3>
      <p>
        {acceptanceSummary(data, hearings)}
        {data.hasFilingLead && FILING_STATES.includes(data.state)
          ? ' The application must be filed before the deadline shown on the clocks.'
          : ''}
      </p>
      {open && !hosted.has('set_board_meeting') ? (
        <MeetingForm data={data} deadline={deadline} />
      ) : null}
      {open && voteReady && !hosted.has('record_board_vote') ? <VoteForm data={data} /> : null}
    </section>
  )
}

export function BoardPanel({
  data,
  hearings,
  hosted = new Set(),
  deadline = null,
  voteBlocked = false,
}: { data: BoardPanelData; hearings: string[] } & Partial<Hosted> & Partial<Reconciled>) {
  return (
    <section aria-label="Board" id="board">
      <h2>{data.boardName}</h2>
      <AcceptanceSection
        data={data}
        hearings={hearings}
        hosted={hosted}
        deadline={deadline}
        voteBlocked={voteBlocked}
      />
      <DeterminationSection
        data={data}
        formElsewhere={hosted.has('record_board_regional_impact')}
      />
      <ListSection data={data} />
      <CostSection data={data} />
      <DecisionSection data={data} />
    </section>
  )
}
