import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { BoardPanelData } from '@/features/boards/panelData'
import { completenessVoteAction, setAcceptanceMeetingAction } from '../../boards/actions'
import {
  CostSection,
  DecisionSection,
  DeterminationSection,
  ListSection,
} from './boardPanelSections'

function MeetingSelect({ data }: { data: BoardPanelData }) {
  const chosen = data.meetings.some((m) => m.id === data.acceptanceMeetingId)
  return (
    <SelectField
      label={data.board === 'zba' ? 'Hearing meeting' : 'Meeting'}
      name="meetingId"
      defaultValue={chosen ? (data.acceptanceMeetingId ?? '') : ''}
      required
      options={[
        ['', 'Choose an upcoming meeting'],
        ...data.meetings.map((m): [string, string] => [m.id, m.text]),
      ]}
    />
  )
}

function VoteForm({ data }: { data: BoardPanelData }) {
  const planning = data.board === 'planning_board'
  return (
    <details>
      <summary>{planning ? 'Record the completeness vote' : 'Open the hearing'}</summary>
      <ActionForm action={completenessVoteAction} submitLabel="Record vote" className="max-w-md">
        <input type="hidden" name="applicationId" value={data.applicationId} />
        <input type="hidden" name="meetingId" value={data.acceptanceMeetingId ?? ''} />
        <p>{`Meeting: ${data.acceptanceText ?? ''}`}</p>
        <TextField
          label="Date of the vote"
          name="votedOn"
          type="date"
          defaultValue={data.acceptanceDate ?? data.today}
          min={data.acceptanceDate ?? undefined}
          required
        />
        <SelectField
          label="Outcome"
          name="outcome"
          options={[
            ['accepted', planning ? 'Accepted as complete' : 'Accepted for hearing'],
            ['not_accepted', planning ? 'Not accepted as complete' : 'Not accepted'],
          ]}
        />
        <TextField label="Reason, if not accepted" name="reason" />
      </ActionForm>
    </details>
  )
}

function acceptanceSummary(data: BoardPanelData): string {
  const planning = data.board === 'planning_board'
  if (data.acceptanceText === null) {
    return planning ? 'No acceptance meeting is set.' : 'No hearing meeting is set.'
  }
  return `${planning ? 'Acceptance meeting' : 'Hearing meeting'}: ${data.acceptanceText}.`
}

function AcceptanceSection({ data }: { data: BoardPanelData }) {
  const planning = data.board === 'planning_board'
  const open = data.canRecord && data.state === 'submitted'
  return (
    <section aria-label={planning ? 'Acceptance' : 'Hearing'} className="space-y-3">
      <h3>{planning ? 'Filing and acceptance' : 'Hearing'}</h3>
      <p>
        {acceptanceSummary(data)}
        {data.hasFilingLead
          ? ' The application must be filed before the deadline shown on the clocks.'
          : ''}
      </p>
      {open ? (
        <ActionForm
          action={setAcceptanceMeetingAction}
          submitLabel="Set the meeting"
          className="max-w-md"
        >
          <input type="hidden" name="applicationId" value={data.applicationId} />
          <MeetingSelect data={data} />
        </ActionForm>
      ) : null}
      {open && data.acceptanceMeetingId !== null ? <VoteForm data={data} /> : null}
    </section>
  )
}

export function BoardPanel({ data }: { data: BoardPanelData }) {
  return (
    <section aria-label="Board" className="space-y-4">
      <h2>{data.boardName}</h2>
      <AcceptanceSection data={data} />
      <DeterminationSection data={data} />
      <ListSection data={data} />
      <CostSection data={data} />
      <DecisionSection data={data} />
    </section>
  )
}
