import { AreaField, CheckField, SelectField, TextField } from '@/components/staff/fields'

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

export function DecisionFields({
  seated,
  today,
  defaultVotedOn,
  minVotedOn,
  offerFinalApproval = false,
}: {
  seated: string[]
  today: string
  defaultVotedOn?: string
  minVotedOn?: string
  offerFinalApproval?: boolean
}) {
  return (
    <>
      <TextField
        label="Date of the vote"
        name="votedOn"
        type="date"
        defaultValue={defaultVotedOn}
        min={minVotedOn}
        max={today}
        required
      />
      <SelectField label="Outcome" name="outcome" options={OUTCOMES} />
      <TextField label="Motion" name="motion" required />
      <AreaField label="How each member voted" name="votes" required hint={votesHint(seated)} />
      <AreaField label="Findings of fact" name="findings" required />
      <AreaField
        label="Conditions"
        name="conditions"
        hint="One per line. Start a line with Before issuance: if it must be met first."
      />
      <AreaField label="Reasons for disapproval" name="reasons" hint="Required when denied." />
      {offerFinalApproval ? (
        <CheckField
          label="This is the last municipal approval the project needs"
          name="finalMunicipalApproval"
        />
      ) : null}
    </>
  )
}
