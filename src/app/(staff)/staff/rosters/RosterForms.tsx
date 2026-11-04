import { ActionForm } from '@/components/ActionForm'
import { AddressTextField } from '@/components/address/AddressTextField'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { RESTRICTION_LABELS, type RostersView } from '@/features/rosters/rosterView'
import { addRestrictionAction, updateRestrictionAction } from './actions'
import {
  addAssociationAction,
  addParkAction,
  updateAssociationAction,
  updateParkAction,
} from './rosterActions'

type Association = RostersView['associations'][number]
type Park = RostersView['parks'][number]
type Holding = RostersView['restrictions'][number]

const KIND_OPTIONS = Object.entries(RESTRICTION_LABELS)
const FORM_CLASS = 'max-w-xl'

function ListedParcel({ parcelId, parcel }: { parcelId: string; parcel: string }) {
  return (
    <>
      <input type="hidden" name="parcelId" value={parcelId} />
      <p className="m-0 text-sm">{`Parcel ${parcel}`}</p>
    </>
  )
}

function AssociationFields({ current, today }: { current?: Association; today: string }) {
  return (
    <>
      <TextField
        label="Association name"
        name="associationName"
        defaultValue={current?.name}
        required
      />
      <TextField
        label="Roster current as of"
        name="asOf"
        type="date"
        defaultValue={current?.asOf ?? today}
        required
      />
      <AreaField
        label="Officers, one per line"
        name="officers"
        hint="Write each line as: Name | Title | Mailing address"
        defaultValue={current?.officersText}
        rows={4}
        required
      />
    </>
  )
}

export function AddAssociation({ today }: { today: string }) {
  return (
    <FormDialog
      label="Add association"
      title="Add an association roster"
      description="For a condominium parcel that has no roster yet. To change a listed roster, use Edit on its row."
    >
      <ActionForm action={addAssociationAction} submitLabel="Add roster" className={FORM_CLASS}>
        <ParcelPicker label="Parcel of the condominium" name="parcelRef" required />
        <AssociationFields today={today} />
      </ActionForm>
    </FormDialog>
  )
}

export function EditAssociation({ row, today }: { row: Association; today: string }) {
  return (
    <RowEditDialog record={`${row.name} roster`} title={`Edit the ${row.name} roster`}>
      <ActionForm
        action={updateAssociationAction}
        submitLabel="Save changes"
        className={FORM_CLASS}
      >
        <ListedParcel parcelId={row.parcelId} parcel={row.parcel} />
        <AssociationFields current={row} today={today} />
      </ActionForm>
    </RowEditDialog>
  )
}

function ParkFields({ current, today }: { current?: Park; today: string }) {
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
      <TextField
        label="Roster current as of"
        name="asOf"
        type="date"
        defaultValue={current?.asOf ?? today}
        required
      />
      <AreaField
        label="Tenants, one per line"
        name="tenants"
        hint="Write each line as: Name | Site | Mailing address"
        defaultValue={current?.tenantsText}
        rows={4}
        required
      />
    </>
  )
}

export function AddPark({ today }: { today: string }) {
  return (
    <FormDialog
      label="Add park"
      title="Add a park roster"
      description="For a park parcel that has no roster yet. To change a listed roster, use Edit on its row."
    >
      <ActionForm action={addParkAction} submitLabel="Add roster" className={FORM_CLASS}>
        <ParcelPicker label="Parcel of the park" name="parcelRef" required />
        <ParkFields today={today} />
      </ActionForm>
    </FormDialog>
  )
}

export function EditPark({ row, today }: { row: Park; today: string }) {
  return (
    <RowEditDialog record={`${row.name} roster`} title={`Edit the ${row.name} roster`}>
      <ActionForm action={updateParkAction} submitLabel="Save changes" className={FORM_CLASS}>
        <ListedParcel parcelId={row.parcelId} parcel={row.parcel} />
        <ParkFields current={row} today={today} />
      </ActionForm>
    </RowEditDialog>
  )
}

function HolderFields({ current }: { current?: Holding }) {
  return (
    <>
      <TextField label="Holder name" name="holderName" defaultValue={current?.holder} required />
      <AddressTextField
        label="Holder mailing address"
        name="holderMailingAddress"
        defaultValue={current?.holderMailingAddress}
        required
      />
      <SelectField
        label="Kind"
        name="restrictionKind"
        options={KIND_OPTIONS}
        defaultValue={current?.kind}
      />
      <TextField
        label="Where it is recorded"
        name="recordedReference"
        defaultValue={current?.reference}
        required
      />
    </>
  )
}

export function AddHolder() {
  return (
    <FormDialog label="Add holder" title="Add an easement or restriction holder">
      <ActionForm action={addRestrictionAction} submitLabel="Add holder" className={FORM_CLASS}>
        <ParcelPicker label="Parcel the restriction covers" name="parcelRef" required />
        <HolderFields />
      </ActionForm>
    </FormDialog>
  )
}

export function EditHolder({ row }: { row: Holding }) {
  return (
    <RowEditDialog record={`${row.holder} on ${row.parcel}`} title={`Edit ${row.holder}`}>
      <ActionForm
        action={updateRestrictionAction}
        submitLabel="Save changes"
        className={FORM_CLASS}
      >
        <input type="hidden" name="holdingId" value={row.id} />
        <p className="m-0 text-sm">{`Parcel ${row.parcel}`}</p>
        <HolderFields current={row} />
      </ActionForm>
    </RowEditDialog>
  )
}
