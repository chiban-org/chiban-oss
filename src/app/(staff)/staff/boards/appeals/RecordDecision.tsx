import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { TextField } from '@/components/staff/fields'
import { recordDecisionDescription } from '@/features/appeals/appealWords'
import { recordAdministrativeDecisionAction } from './actions'

export function RecordDecision({ today }: { today: string }) {
  return (
    <FormDialog
      label="Record an administrative decision"
      title="Record an administrative decision"
      description={recordDecisionDescription()}
      variant="default"
    >
      <ActionForm
        action={recordAdministrativeDecisionAction}
        submitLabel="Record the decision"
        className="max-w-md"
      >
        <TextField
          label="Application or permit number"
          name="applicationNumber"
          hint="As it appears on the application, for example BP-2027-0001."
          required
        />
        <TextField
          label="Date of the decision"
          name="occurredOn"
          type="date"
          defaultValue={today}
          max={today}
          required
        />
      </ActionForm>
    </FormDialog>
  )
}
