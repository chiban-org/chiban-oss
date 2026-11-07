import { ActionForm } from '@/components/ActionForm'
import { GroupFieldError } from '@/components/fieldErrors'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import { meetingIsAhead } from '@/features/applications/boardRequirements'
import {
  type MeetingDeadline,
  meetingConflict,
  meetingOptionText,
} from '@/features/applications/meetingDeadline'
import type { BoardPanelData } from '@/features/boards/panelData'
import {
  boardRegionalImpactAction,
  completenessVoteAction,
  setAcceptanceMeetingAction,
} from '../../boards/actions'

type Variant = 'default' | 'outline'

function MeetingSelect({
  data,
  deadline,
  chosen,
}: {
  data: BoardPanelData
  deadline: MeetingDeadline | null
  chosen: string
}) {
  return (
    <SelectField
      label={data.board === 'zba' ? 'Hearing meeting' : 'Meeting'}
      name="meetingId"
      defaultValue={data.meetings.some((m) => m.id === chosen) ? chosen : ''}
      required
      options={[
        ['', 'Choose an upcoming meeting'],
        ...data.meetings.map((m): [string, string] => [m.id, meetingOptionText(m, deadline)]),
      ]}
    />
  )
}

export function MeetingForm({
  data,
  deadline,
  variant = 'outline',
}: {
  data: BoardPanelData
  deadline: MeetingDeadline | null
  variant?: Variant
}) {
  const target = meetingConflict(data, deadline)?.target ?? null
  return (
    <ActionForm
      action={setAcceptanceMeetingAction}
      submitLabel={target === null ? 'Set the meeting' : 'Move the meeting'}
      variant={variant}
      className="max-w-md"
    >
      <input type="hidden" name="applicationId" value={data.applicationId} />
      <MeetingSelect
        data={data}
        deadline={deadline}
        chosen={target ?? data.acceptanceMeetingId ?? ''}
      />
    </ActionForm>
  )
}

function outcomeOptions(planning: boolean): [string, string][] {
  return [
    ['accepted', planning ? 'Accepted as complete' : 'Accepted for hearing'],
    ['not_accepted', planning ? 'Not accepted as complete' : 'Not accepted'],
  ]
}

export function VoteFormBody({
  data,
  variant = 'outline',
  rejectOnly = false,
}: {
  data: BoardPanelData
  variant?: Variant
  rejectOnly?: boolean
}) {
  const planning = data.board === 'planning_board'
  if (meetingIsAhead(data)) {
    return <p>{`Record the vote once the meeting on ${data.acceptanceText ?? ''} has happened.`}</p>
  }
  return (
    <ActionForm
      action={completenessVoteAction}
      submitLabel="Record vote"
      variant={variant}
      confirm={{
        title: 'Record this vote?',
        body: "The outcome you chose is recorded as the board's vote on whether this application goes ahead.",
        confirmLabel: 'Record vote',
        tone: 'default',
      }}
      className="max-w-md"
    >
      <input type="hidden" name="applicationId" value={data.applicationId} />
      <input type="hidden" name="meetingId" value={data.acceptanceMeetingId ?? ''} />
      <p>{`Meeting: ${data.acceptanceText ?? ''}`}</p>
      <TextField
        label="Date of the vote"
        name="votedOn"
        type="date"
        defaultValue={data.acceptanceDate ?? data.today}
        min={data.acceptanceDate ?? undefined}
        max={data.today}
        required
      />
      {rejectOnly ? (
        <input type="hidden" name="outcome" value="not_accepted" />
      ) : (
        <SelectField label="Outcome" name="outcome" options={outcomeOptions(planning)} />
      )}
      <TextField
        label={rejectOnly ? 'Reason' : 'Reason, if not accepted'}
        name="reason"
        required={rejectOnly}
      />
    </ActionForm>
  )
}

export function BoardRegionalForm({
  data,
  variant = 'outline',
}: {
  data: BoardPanelData
  variant?: Variant
}) {
  return (
    <ActionForm
      action={boardRegionalImpactAction}
      submitLabel="Record determination"
      variant={variant}
      className="max-w-md"
    >
      <input type="hidden" name="applicationId" value={data.applicationId} />
      <SelectField
        label="Determination"
        name="determination"
        options={[
          ['no', 'No regional impact'],
          ['yes', 'Regional impact'],
          ['previously_determined', 'Previously determined by another board'],
        ]}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          Affected municipalities, if there is regional impact
        </legend>
        {data.regional.options.map((o) => (
          <CheckField
            key={o.key}
            label={o.name}
            name="municipalityKeys"
            groupMember
            value={o.key}
            defaultChecked={data.regional.chosen.includes(o.key)}
          />
        ))}
        <GroupFieldError name="municipalityKeys" />
      </fieldset>
      <TextField label="Board reference, if determined earlier" name="previousBoardRef" />
    </ActionForm>
  )
}
