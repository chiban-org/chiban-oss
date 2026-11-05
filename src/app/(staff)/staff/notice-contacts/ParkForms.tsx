import { ActionForm } from '@/components/ActionForm'
import { AddressTextField } from '@/components/address/AddressTextField'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { TextField } from '@/components/staff/fields'
import type { ParkRow } from '@/features/rosters/contactRows'
import { AsOfField, FORM_CLASS, ListedParcel } from './AssociationForms'
import { ContactRows } from './ContactRows'
import { addParkAction, updateParkAction } from './rosterActions'

function ParkFields({ current, today }: { current?: ParkRow; today: string }) {
  return (
    <>
      <TextField label="Park name" name="parkName" defaultValue={current?.name} required />
      <TextField label="Owner name" name="ownerName" defaultValue={current?.owner} required />
      <AddressTextField
        label="Owner mailing address"
        name="ownerMailingAddress"
        defaultValue={current?.ownerMailingAddress}
        required
      />
      <AsOfField current={current?.asOf} today={today} />
      <ContactRows
        kind="tenant"
        initial={(current?.tenants ?? []).map((t) => ({
          id: t.tenantId,
          name: t.name,
          middle: t.siteLabel,
          mailingAddress: t.mailingAddress,
        }))}
      />
    </>
  )
}

export function AddPark({ today }: { today: string }) {
  return (
    <FormDialog
      label="Add park"
      title="Add a manufactured housing park"
      description="For a park parcel with nothing on file yet. To change a listed park, use Edit on its row."
    >
      <ActionForm action={addParkAction} submitLabel="Add park" className={FORM_CLASS}>
        <ParcelPicker label="Parcel of the park" name="parcelRef" required />
        <ParkFields today={today} />
      </ActionForm>
    </FormDialog>
  )
}

export function EditPark({ row, today }: { row: ParkRow; today: string }) {
  return (
    <RowEditDialog record={row.name} title={`Edit ${row.name}`}>
      <ActionForm action={updateParkAction} submitLabel="Save changes" className={FORM_CLASS}>
        <ListedParcel parcelId={row.parcelId} parcel={row.parcel} />
        <ParkFields current={row} today={today} />
      </ActionForm>
    </RowEditDialog>
  )
}
