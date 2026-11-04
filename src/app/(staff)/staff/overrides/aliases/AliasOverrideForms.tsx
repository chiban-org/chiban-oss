import { ActionForm } from '@/components/ActionForm'
import { FormDialog, RowEditDialog } from '@/components/FormDialog'
import { ParcelPicker } from '@/components/parcels/picker/ParcelPicker'
import { TextField } from '@/components/staff/fields'
import type { AliasOverrideRow } from '@/features/parcels/aliasOverrides'
import { createAliasOverrideAction } from '../../parcels/[parcelId]/actions'

export function AddAliasOverride() {
  return (
    <FormDialog label="Add override" title="Add a parcel ID override" variant="default">
      <ActionForm
        action={createAliasOverrideAction}
        submitLabel="Save override"
        className="max-w-md"
      >
        <TextField label="Format key" name="format" required hint="For example cama15 or gis12." />
        <TextField label="ID value" name="value" required />
        <ParcelPicker
          label="Points to parcel"
          name="parcelRef"
          required
          hint="Any current or retired parcel."
        />
        <TextField label="Reason" name="reason" required />
        <TextField label="Expires on" name="expiresOn" type="date" />
      </ActionForm>
    </FormDialog>
  )
}

export function EditAliasOverride({ row }: { row: AliasOverrideRow }) {
  const id = `${row.format}: ${row.value}`
  const current = row.parcelDisplayId ?? 'the parcel it points to now'
  return (
    <RowEditDialog
      record={`override for ${id}`}
      title={`Change the override for ${id}`}
      description="Saving adds a new override for this ID. This one stays listed as superseded."
    >
      <ActionForm
        action={createAliasOverrideAction}
        submitLabel="Save override"
        className="max-w-md"
      >
        <input type="hidden" name="format" value={row.format} />
        <input type="hidden" name="value" value={row.value} />
        <input type="hidden" name="parcelId" value={row.parcelId} />
        <ParcelPicker
          label="Points to parcel"
          name="parcelRef"
          hint={`Leave blank to keep ${current}.`}
        />
        <TextField label="Reason" name="reason" defaultValue={row.reason} required />
        <TextField
          label="Expires on"
          name="expiresOn"
          type="date"
          defaultValue={row.expiresOn ?? undefined}
        />
      </ActionForm>
    </RowEditDialog>
  )
}
