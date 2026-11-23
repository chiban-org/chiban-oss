import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import {
  appealResultLabel,
  appealStepHint,
  appealStepOptions,
  rehearingGrantedLabel,
} from '@/features/appeals/appealWords'
import { addAppealNodeAction } from '../../hearings/decisionActions'
import { LastApprovalCheck } from '../../hearings/LastApprovalCheck'

const STEP_ORDER = [
  'zba_appeal',
  'zba_decision',
  'rehearing_motion',
  'rehearing_outcome',
  'court_petition',
] as const

function results(): [string, string][] {
  return [
    ['', 'Not applicable'],
    ['approved', 'Appeal granted'],
    ['denied', 'Denied'],
    ['granted', rehearingGrantedLabel()],
  ]
}

export function AppealSteps({
  nodeChoices,
  today,
  offerFinalApproval = false,
}: {
  nodeChoices: { id: string; label: string }[]
  today: string
  offerFinalApproval?: boolean
}) {
  return (
    <ActionForm action={addAppealNodeAction} submitLabel="Record the step" className="max-w-md">
      <input type="hidden" name="linked" value="no" />
      <SelectField
        label="Follows"
        name="parentId"
        options={nodeChoices.map((n): [string, string] => [n.id, n.label])}
      />
      <SelectField label="Step" name="kind" options={appealStepOptions(STEP_ORDER)} />
      <TextField
        label="Date"
        name="occurredOn"
        type="date"
        defaultValue={today}
        max={today}
        required
      />
      <TextField label="Who appealed" name="appellantName" hint={appealStepHint()} />
      <SelectField label={appealResultLabel()} name="outcome" options={results()} />
      <LastApprovalCheck offered={offerFinalApproval} />
    </ActionForm>
  )
}
