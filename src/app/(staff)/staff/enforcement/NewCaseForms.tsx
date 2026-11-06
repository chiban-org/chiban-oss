import { ActionForm } from '@/components/ActionForm'
import { FormDialog } from '@/components/FormDialog'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { TextField } from '@/components/staff/fields'
import { openCaseAction, staffComplaintAction } from './actions'

const PARCEL_HINT = 'Without one, Chiban links the parcel whose site address matches exactly.'

export function NewCaseForms() {
  return (
    <>
      <FormDialog label="Open a case" title="Open a case" variant="default">
        <ActionForm action={openCaseAction} submitLabel="Open case">
          <TextField label="Where is the property?" name="locationText" required />
          <ParcelPicker label="Parcel, if known" name="parcelRef" hint={PARCEL_HINT} />
        </ActionForm>
      </FormDialog>
      <FormDialog
        label="Enter a complaint"
        title="Enter a complaint taken by phone or at the counter"
        description="Entering a complaint opens a case for it."
      >
        <ActionForm action={staffComplaintAction} submitLabel="Record complaint">
          <TextField label="Where is the property?" name="locationText" required />
          <TextField label="What was reported?" name="description" required />
          <ParcelPicker label="Parcel, if known" name="parcelRef" hint={PARCEL_HINT} />
        </ActionForm>
      </FormDialog>
    </>
  )
}
