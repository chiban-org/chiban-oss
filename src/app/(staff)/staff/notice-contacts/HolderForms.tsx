import { ActionForm } from '@/components/ActionForm'
import { AddressTextField } from '@/components/address/AddressTextField'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { SelectField, TextField } from '@/components/staff/fields'
import { type HoldingRow, RESTRICTION_LABELS } from '@/features/rosters/contactRows'
import { FORM_CLASS } from './AssociationForms'
import {
  addRestrictionAction,
  endRestrictionAction,
  undoRestrictionEndAction,
  updateRestrictionAction,
} from './actions'

const KIND_OPTIONS = Object.entries(RESTRICTION_LABELS)

function HolderFields({ current }: { current?: HoldingRow }) {
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
    <FormDialog label="Add holder" title="Add a restriction holder">
      <ActionForm action={addRestrictionAction} submitLabel="Add holder" className={FORM_CLASS}>
        <ParcelPicker label="Parcel the restriction covers" name="parcelRef" required />
        <HolderFields />
      </ActionForm>
    </FormDialog>
  )
}

export function EditHolder({ row }: { row: HoldingRow }) {
  return (
    <RowEditDialog record={`${row.holder} on ${row.parcel}`} title={`Edit ${row.holder}`}>
      <ActionForm
        action={updateRestrictionAction}
        submitLabel="Save changes"
        className={FORM_CLASS}
      >
        <input type="hidden" name="holdingId" value={row.entryId} />
        <p className="m-0 text-sm">{`Parcel ${row.parcel}`}</p>
        <HolderFields current={row} />
      </ActionForm>
    </RowEditDialog>
  )
}

export function EndHolder({ row, today }: { row: HoldingRow; today: string }) {
  return (
    <FormDialog
      label="End"
      accessibleLabel={`End ${row.holder} on ${row.parcel}`}
      title={`End ${row.holder} on ${row.parcel}`}
      description="From this date the holder is no longer sent notice for this land."
      size="sm"
    >
      <ActionForm
        action={endRestrictionAction}
        submitLabel="End restriction"
        variant="destructive"
        className={FORM_CLASS}
        confirm={{
          title: `End ${row.holder} on ${row.parcel}?`,
          body: 'Lists drawn on or after the date leave this holder off. Undo stays available until a list uses the ending.',
          confirmLabel: 'End restriction',
        }}
      >
        <input type="hidden" name="holdingId" value={row.entryId} />
        <TextField label="End on" name="endedOn" type="date" defaultValue={today} required />
      </ActionForm>
    </FormDialog>
  )
}

export function UndoEnd({ row }: { row: HoldingRow }) {
  return (
    <ActionForm
      action={undoRestrictionEndAction}
      submitLabel="Undo ending"
      submitAccessibleLabel={`Undo ending ${row.holder} on ${row.parcel}`}
      compact
    >
      <input type="hidden" name="holdingId" value={row.entryId} />
    </ActionForm>
  )
}
