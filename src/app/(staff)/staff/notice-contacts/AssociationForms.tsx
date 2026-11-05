import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { TextField } from '@/components/staff/fields'
import type { PickedParcel } from '@/features/parcels/parcelPick'
import type { AssociationRow } from '@/features/rosters/contactRows'
import { ContactRows } from './ContactRows'
import { addAssociationAction, updateAssociationAction } from './rosterActions'

export const FORM_CLASS = 'max-w-xl'

export function ListedParcel({ parcelId, parcel }: { parcelId: string; parcel: string }) {
  return (
    <>
      <input type="hidden" name="parcelId" value={parcelId} />
      <p className="m-0 text-sm">{`Parcel ${parcel}`}</p>
    </>
  )
}

export function AsOfField({ current, today }: { current: string | undefined; today: string }) {
  return (
    <TextField
      label="List current as of"
      name="asOf"
      type="date"
      defaultValue={current ?? today}
      required
    />
  )
}

function AssociationFields({ current, today }: { current?: AssociationRow; today: string }) {
  return (
    <>
      <TextField
        label="Association name"
        name="associationName"
        defaultValue={current?.name}
        required
      />
      <AsOfField current={current?.asOf} today={today} />
      <ContactRows
        kind="officer"
        initial={(current?.officers ?? []).map((o) => ({
          name: o.name,
          middle: o.title,
          mailingAddress: o.mailingAddress,
        }))}
      />
    </>
  )
}

export function AddAssociation({
  today,
  parcel = null,
  open = false,
  label = 'Add association',
}: {
  today: string
  parcel?: PickedParcel | null
  open?: boolean
  label?: string
}) {
  return (
    <FormDialog
      label={label}
      title="Add a condo association"
      description="For a condo parcel with no association on file. Notices for it go to these officers."
      defaultOpen={open}
      {...(parcel === null
        ? {}
        : { accessibleLabel: `${label} for ${parcel.displayId ?? 'this parcel'}` })}
    >
      <ActionForm
        action={addAssociationAction}
        submitLabel="Add association"
        className={FORM_CLASS}
      >
        <ParcelPicker
          label="Parcel of the condominium"
          name="parcelRef"
          required
          initial={parcel === null ? null : { kind: 'parcel', parcel }}
        />
        <AssociationFields today={today} />
      </ActionForm>
    </FormDialog>
  )
}

export function EditAssociation({ row, today }: { row: AssociationRow; today: string }) {
  return (
    <RowEditDialog record={row.name} title={`Edit ${row.name}`}>
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
