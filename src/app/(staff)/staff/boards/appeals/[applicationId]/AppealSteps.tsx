import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { addAppealNodeAction } from '../../hearings/decisionActions'

const STEPS: [string, string][] = [
  ['zba_appeal', 'Appeal to the Zoning Board'],
  ['zba_decision', 'Zoning Board decision'],
  ['rehearing_motion', 'Motion for rehearing'],
  ['rehearing_outcome', 'Rehearing decision'],
  ['court_petition', 'Court petition'],
]

const RESULTS: [string, string][] = [
  ['', 'Not applicable'],
  ['approved', 'Appeal granted'],
  ['denied', 'Denied'],
  ['granted', 'Rehearing granted'],
]

export function AppealSteps({
  nodeChoices,
  today,
}: {
  nodeChoices: { id: string; label: string }[]
  today: string
}) {
  return (
    <ActionForm action={addAppealNodeAction} submitLabel="Record the step" className="max-w-md">
      <input type="hidden" name="linked" value="no" />
      <SelectField
        label="Follows"
        name="parentId"
        options={nodeChoices.map((n): [string, string] => [n.id, n.label])}
      />
      <SelectField label="Step" name="kind" options={STEPS} />
      <TextField
        label="Date"
        name="occurredOn"
        type="date"
        defaultValue={today}
        max={today}
        required
      />
      <TextField
        label="Who appealed"
        name="appellantName"
        hint="For an appeal to the Zoning Board. An appeal of an issued permit suspends it."
      />
      <SelectField
        label="Result, for a Zoning Board or rehearing decision"
        name="outcome"
        options={RESULTS}
      />
    </ActionForm>
  )
}
