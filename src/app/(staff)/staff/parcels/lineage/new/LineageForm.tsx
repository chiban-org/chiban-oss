import { ActionForm } from '@/components/ActionForm'
import { ParcelMultiPicker } from '@/components/parcels/picker/ParcelPicker'
import type { PickerChoice } from '@/components/parcels/picker/pickerChoice'
import { SelectField, TextField } from '@/components/staff/fields'
import { recordLineageAction } from '../../[parcelId]/actions'

const KINDS = [
  ['subdivision', 'Subdivision'],
  ['lot_line_adjustment', 'Lot-line adjustment'],
  ['merge', 'Merge'],
] as const

export const newChildHint = (shape: string) =>
  `A child ID that is not in the parcel layer yet can be added with "Use this ID anyway" if it is a new ID in this shape. ${shape}`.trim()

const BASES = [
  ['recording', 'Recording date'],
  ['approval', 'Approval date'],
] as const

export function LineageForm({
  parents,
  childHint,
}: {
  parents: PickerChoice[]
  childHint: string
}) {
  return (
    <ActionForm
      action={recordLineageAction}
      submitLabel="Record lineage event"
      variant="default"
      className="mt-4 max-w-xl"
    >
      <SelectField label="Kind" name="kind" options={KINDS} />
      <TextField label="Effective date" name="effectiveDate" type="date" required />
      <SelectField label="Date basis" name="effectiveBasis" options={BASES} />
      <TextField label="Recording reference" name="reference" hint="Book and page, if recorded." />
      <ParcelMultiPicker label="Parent parcels" name="parents" initial={parents} required />
      <ParcelMultiPicker
        label="Child parcels"
        name="children"
        required
        allowUnknown
        hint={childHint}
      />
    </ActionForm>
  )
}
