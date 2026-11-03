import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import type { HearingView } from '@/features/hearings/views'
import { recordDecisionAction } from '../decisionActions'

const OUTCOMES: [string, string][] = [
  ['approved', 'Approved'],
  ['approved_with_conditions', 'Approved with conditions'],
  ['denied', 'Denied'],
]

function votesHint(seated: string[]): string {
  const roster =
    seated.length === 0
      ? 'No members are seated on this board. Add them on the board members page first.'
      : `Seated members: ${seated.join(', ')}.`
  return `One member per line, for example: ${seated[0] ?? 'Avery Stone'}: for. Use for, against, abstain, or recused. ${roster}`
}

export function RecordDecisionSection({ view, today }: { view: HearingView; today: string }) {
  return (
    <section aria-labelledby="record-decision" className="space-y-3">
      <h2 id="record-decision">Record the decision</h2>
      <ActionForm
        action={recordDecisionAction}
        submitLabel="Record decision"
        variant="default"
        className="max-w-2xl"
      >
        <input type="hidden" name="applicationId" value={view.applicationId} />
        <input type="hidden" name="hearingId" value={view.hearingId} />
        <TextField
          label="Date of the vote"
          name="votedOn"
          type="date"
          defaultValue={view.defaultVotedOn}
          min={view.defaultVotedOn}
          max={today}
          required
        />
        <SelectField label="Outcome" name="outcome" options={OUTCOMES} />
        <TextField label="Motion" name="motion" required />
        <AreaField
          label="How each member voted"
          name="votes"
          required
          hint={votesHint(view.seatedMembers)}
        />
        <AreaField label="Findings of fact" name="findings" required />
        <AreaField
          label="Conditions"
          name="conditions"
          hint="One per line. Start a line with Before issuance: if it must be met first."
        />
        <AreaField label="Reasons for disapproval" name="reasons" hint="Required when denied." />
      </ActionForm>
    </section>
  )
}
