import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { requireStaffContext } from '@/server/requireStaff'
import { recordLineageAction } from '../../[parcelId]/actions'

interface NewLineagePageProps {
  searchParams: Promise<{ parent?: string }>
}

const KINDS = [
  ['subdivision', 'Subdivision'],
  ['lot_line_adjustment', 'Lot-line adjustment'],
  ['merge', 'Merge'],
] as const

const BASES = [
  ['recording', 'Recording date'],
  ['approval', 'Approval date'],
] as const

export default async function NewLineageEventPage({ searchParams }: NewLineagePageProps) {
  const ctx = await requireStaffContext()
  if (!(await hasCapability(ctx.db, ctx.actor.userId, 'parcel.manage', ctx.signal))) {
    return <NoPermission title="Record lineage event" action="record lineage events" />
  }
  const { parent = '' } = await searchParams
  return (
    <main>
      <h1>Record lineage event</h1>
      <p className="text-muted-foreground">
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
        <AreaField
          label="Parent parcel IDs"
          name="parents"
          rows={2}
          defaultValue={parent}
          required
          hint="Separate IDs with spaces, commas, or new lines."
        />
        <AreaField label="Child parcel IDs" name="children" rows={3} required />
      </ActionForm>
    </main>
  )
}
