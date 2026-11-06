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
  if (!planning && hearings.length > 0) return `Hearings: ${hearings.join(' ')}`
  if (data.acceptanceText === null) {
    return planning ? 'No acceptance meeting is set.' : 'No hearing is scheduled.'
  }
  return `${planning ? 'Acceptance meeting' : 'Hearing meeting'}: ${data.acceptanceText}.`
}

interface Hosted {
  hosted: ReadonlySet<PlanActionKind>
}

function AcceptanceSection({
  data,
  hearings,
  hosted,
}: { data: BoardPanelData; hearings: string[] } & Hosted) {
  const planning = data.board === 'planning_board'
  const open = data.canRecord && data.state === 'submitted'
  return (
    <section aria-label={planning ? 'Acceptance' : 'Hearing'}>
      <h3>{planning ? 'Filing and acceptance' : 'Hearing'}</h3>
      <p>
        {acceptanceSummary(data, hearings)}
        {data.hasFilingLead && FILING_STATES.includes(data.state)
          ? ' The application must be filed before the deadline shown on the clocks.'
          : ''}
      </p>
      {open && !hosted.has('set_board_meeting') ? <MeetingForm data={data} /> : null}
      {open && data.acceptanceMeetingId !== null && !hosted.has('record_board_vote') ? (
        <VoteForm data={data} />
      ) : null}
    </section>
  )
}

export function BoardPanel({
  data,
  hearings,
  hosted = new Set(),
}: { data: BoardPanelData; hearings: string[] } & Partial<Hosted>) {
  return (
    <section aria-label="Board" id="board">
      <h2>{data.boardName}</h2>
      <AcceptanceSection data={data} hearings={hearings} hosted={hosted} />
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
