import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { listUnresolvedRecords } from '@/features/parcels/unresolvedView'
import { requireStaffContext } from '@/server/requireStaff'
import { resolveUnresolvedAction } from '../[parcelId]/actions'

export default async function StaffUnresolvedPage() {
  const ctx = await requireStaffContext()
  const links = await listUnresolvedRecords(ctx.db, ctx.actor, ctx.signal)
  return (
    <main>
      <h1>Unresolved records</h1>
      <p className="text-muted-foreground">
        These records name a parcel ID that is not in Chiban. They link automatically after an
        import brings the parcel in, or you can link them by hand.
      </p>
      {links.length === 0 ? (
        <p className="mt-4">Every record is linked to a parcel.</p>
      ) : (
        <ul className="divide-y">
          {links.map((link) => (
            <li key={link.linkId} className="py-4">
              <p className="font-semibold">{link.record}</p>
              <p className="text-sm">{`Named parcel: ${link.namedParcel}`}</p>
              <ActionForm
                action={resolveUnresolvedAction}
                submitLabel="Link to parcel"
                className="mt-2 max-w-md"
              >
                <input type="hidden" name="linkId" value={link.linkId} />
                <TextField label="Parcel ID" name="parcelRef" required />
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
