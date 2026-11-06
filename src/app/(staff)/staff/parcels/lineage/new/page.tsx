import type { Metadata } from 'next'
import { ActionForm } from '@/components/ActionForm'
import { ParcelMultiPicker } from '@/components/parcels/picker/ParcelPicker'
import type { PickerChoice } from '@/components/parcels/picker/pickerChoice'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import type { Db } from '@/db/client'
import { hasCapability } from '@/features/authz/capabilities'
import { pickedParcelFor } from '@/features/parcels/parcelPick'
import { requireStaffContext } from '@/server/requireStaff'
import { recordLineageAction } from '../../[parcelId]/actions'

export const metadata: Metadata = { title: 'Record lineage event' }

interface NewLineagePageProps {
  searchParams: Promise<{ parent?: string }>
}

const KINDS = [
  ['subdivision', 'Subdivision'],
  ['lot_line_adjustment', 'Lot-line adjustment'],
  ['merge', 'Merge'],
] as const

const CHILD_HINT =
  'A child ID that is not in the parcel layer yet can be added with "Use this ID anyway".'

const BASES = [
  ['recording', 'Recording date'],
  ['approval', 'Approval date'],
] as const

async function startingParents(db: Db, ref: string, signal: AbortSignal): Promise<PickerChoice[]> {
  if (ref.trim() === '') return []
  const parcel = await pickedParcelFor(db, ref, signal)
  return parcel === null ? [{ kind: 'raw', value: ref.trim() }] : [{ kind: 'parcel', parcel }]
}

export default async function NewLineageEventPage({ searchParams }: NewLineagePageProps) {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'parcel.manage', ctx.signal))) {
    return <NoPermission title="Record lineage event" action="record lineage events" />
  }
  const { parent = '' } = await searchParams
  const parents = await startingParents(ctx.db, parent, ctx.signal)
  return (
    <main>
      <h1>Record lineage event</h1>
      <p>
        The effective date is the legal date. Parents that are not also children are retired on that
        date. Child IDs that Chiban does not know yet are created without a shape.
      </p>
      <ActionForm
        action={recordLineageAction}
        submitLabel="Record lineage event"
        variant="default"
        className="mt-4 max-w-xl"
      >
        <SelectField label="Kind" name="kind" options={KINDS} />
        <TextField label="Effective date" name="effectiveDate" type="date" required />
        <SelectField label="Date basis" name="effectiveBasis" options={BASES} />
        <TextField
          label="Recording reference"
          name="reference"
          hint="Book and page, if recorded."
        />
        <ParcelMultiPicker label="Parent parcels" name="parents" initial={parents} required />
        <ParcelMultiPicker
          label="Child parcels"
          name="children"
          required
          allowUnknown
          hint={CHILD_HINT}
        />
      </ActionForm>
    </main>
  )
}
