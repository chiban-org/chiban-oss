import type { Metadata } from 'next'
import type { PickerChoice } from '@/components/parcels/picker/pickerChoice'
import { NoPermission } from '@/components/staff/NoPermission'
import type { Db } from '@/db/client'
import { hasCapability } from '@/features/authz/capabilities'
import { displayFormatHint } from '@/features/parcels/displayFormat'
import { pickedParcelFor } from '@/features/parcels/parcelPick'
import { requireStaffContext } from '@/server/requireStaff'
import { LineageForm, newChildHint } from './LineageForm'

export const metadata: Metadata = { title: 'Record lineage event' }

interface NewLineagePageProps {
  searchParams: Promise<{ parent?: string }>
}

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
  const childHint = newChildHint(await displayFormatHint(ctx.db))
  return (
    <main>
      <h1>Record lineage event</h1>
      <p>
        The effective date is the legal date. Parents that are not also children are retired on that
        date. Child IDs that Chiban does not know yet are created without a shape.
      </p>
      <LineageForm parents={parents} childHint={childHint} />
    </main>
  )
}
