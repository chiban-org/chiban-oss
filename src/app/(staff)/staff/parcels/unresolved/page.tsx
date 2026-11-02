import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { listUnresolvedLinks } from '@/features/parcels/unresolvedList'
import { createContext } from '@/server/trpc/context'
import { resolveUnresolvedAction } from '../[parcelId]/actions'

export default async function StaffUnresolvedPage() {
  const ctx = await createContext()
  const links = await listUnresolvedLinks(ctx.db, ctx.signal)
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
            <li key={link.id} className="py-4">
              <p className="font-semibold">{`${link.recordKind} ${link.recordId}`}</p>
              <p className="text-sm">{`Named parcel: ${link.rawRefValue ?? 'unknown'}${link.rawRefFormat === null ? '' : ` (${link.rawRefFormat})`}`}</p>
              <ActionForm
                action={resolveUnresolvedAction}
                submitLabel="Link to parcel"
                className="mt-2 max-w-md"
              >
                <input type="hidden" name="linkId" value={link.id} />
                <TextField label="Parcel ID" name="parcelRef" required />
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
