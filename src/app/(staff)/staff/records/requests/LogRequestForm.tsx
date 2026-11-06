import { ActionForm } from '@/components/ActionForm'
import { AddressTextField } from '@/components/address/AddressTextField'
import { FormDialog } from '@/components/FormDialog'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { RTK_VIA_LABELS } from '@/features/rtk/labels'
import { logRequestAction } from './actions'

export function LogRequest({ today }: { today: string }) {
  return (
    <FormDialog label="Log a request" title="Log a Right-to-Know request" variant="default">
      <ActionForm action={logRequestAction} submitLabel="Log request">
        <TextField
          label="Date received"
          name="receivedOn"
          type="date"
          defaultValue={today}
          required
        />
        <SelectField
          label="How it arrived"
          name="receivedVia"
          options={Object.entries(RTK_VIA_LABELS)}
        />
        <TextField label="Requester name" name="requesterName" />
        <AddressTextField label="Requester email, phone, or address" name="requesterContact" />
        <AreaField label="What was asked for" name="description" rows={3} required />
      </ActionForm>
    </FormDialog>
  )
}
