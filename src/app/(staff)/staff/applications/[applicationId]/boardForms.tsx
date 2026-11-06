import { ActionForm } from '@/components/ActionForm'
import { GroupFieldError } from '@/components/fieldErrors'
import { CheckField, SelectField, TextField } from '@/components/staff/fields'
import { meetingIsAhead } from '@/features/applications/boardRequirements'
import type { BoardPanelData } from '@/features/boards/panelData'
import {
  boardRegionalImpactAction,
  completenessVoteAction,
  setAcceptanceMeetingAction,
} from '../../boards/actions'

type Variant = 'default' | 'outline'

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

export function MeetingForm({
  data,
  variant = 'outline',
}: {
  data: BoardPanelData
  variant?: Variant
}) {
  return (
    <ActionForm
      action={setAcceptanceMeetingAction}
      submitLabel="Set the meeting"
      variant={variant}
      className="max-w-md"
    >
      <input type="hidden" name="applicationId" value={data.applicationId} />
      <MeetingSelect data={data} />
    </ActionForm>
  )
}

export function VoteFormBody({
  data,
  variant = 'outline',
}: {
  data: BoardPanelData
  variant?: Variant
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
