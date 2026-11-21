import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import {
  appealResultLabel,
  appealStepHint,
  appealToBoard,
  boardDecision,
  motionForRehearing,
  rehearingDecision,
  rehearingGrantedLabel,
} from '@/features/appeals/appealWords'
import { addAppealNodeAction } from '../../hearings/decisionActions'
import { LastApprovalCheck } from '../../hearings/LastApprovalCheck'

function steps(): [string, string][] {
  return [
    ['zba_appeal', appealToBoard()],
    ['zba_decision', boardDecision()],
    ['rehearing_motion', motionForRehearing()],
    ['rehearing_outcome', rehearingDecision()],
    ['court_petition', 'Court petition'],
  ]
}

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
      <SelectField label="Step" name="kind" options={steps()} />
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
