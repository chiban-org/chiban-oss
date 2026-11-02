import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { displayIdsFor } from '@/features/parcels/displayId'
import { searchParcels } from '@/features/parcels/searchParcels'
import { listPortalTypes } from '@/features/portal/drafts'
import { requirePortalContext } from '@/server/requirePortal'
import { isUuid } from '@/utils/uuid'
import { startApplicationAction } from './actions'

export const dynamic = 'force-dynamic'

const LINK = 'tap-target inline-flex items-center underline'
const MIN_QUERY = 2

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; parcel?: string }>
}) {
  const { q = '', parcel } = await searchParams
  const ctx = await requirePortalContext('/portal/apply')
  const parcelId = parcel !== undefined && isUuid(parcel) ? parcel : null
  if (parcelId !== null) {
    const [types, display] = await Promise.all([
      listPortalTypes(ctx.db, ctx.signal),
      displayIdsFor(ctx.db, [parcelId]),
    ])
    return (
      <main className="space-y-4">
        <h1>Choose the kind of application</h1>
        <p>{`Parcel ${display.get(parcelId) ?? ''}`}</p>
        <ActionForm action={startApplicationAction} submitLabel="Continue" variant="default">
          <input type="hidden" name="parcelId" value={parcelId} />
          <fieldset className="space-y-2 border-0 p-0">
            <legend className="font-medium">Application type</legend>
            {types.map((t, i) => (
              <label key={t.key} className="flex min-h-11 items-center gap-3 text-base">
                <input type="radio" name="typeKey" value={t.key} defaultChecked={i === 0} />
                {t.label}
              </label>
            ))}
          </fieldset>
        </ActionForm>
        <Link href="/portal/apply" className={LINK}>
          Choose a different parcel
        </Link>
      </main>
    )
  }
  const query = q.trim()
  const hits =
    query.length >= MIN_QUERY ? await searchParcels(ctx.db, { q: query }, ctx.signal) : []
  const display = await displayIdsFor(
    ctx.db,
    hits.map((h) => h.parcelId),
  )
  return (
    <main className="space-y-4">
      <h1>Start an application</h1>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-base">
          Find your parcel by address, owner, or parcel ID
          <input
            name="q"
            defaultValue={query}
            className="min-h-11 rounded-md border px-3 text-base"
          />
        </label>
        <button type="submit" className="min-h-11 rounded-md border px-4 text-base">
          Search
        </button>
      </form>
      {query.length > 0 && query.length < MIN_QUERY ? <p>Enter at least two characters.</p> : null}
      {query.length >= MIN_QUERY && hits.length === 0 ? <p>No parcels match that search.</p> : null}
      <ul className="m-0 list-none divide-y p-0">
        {hits.map((h) => (
          <li key={h.parcelId} className="py-2">
            <Link href={`/portal/apply?parcel=${h.parcelId}`} className={LINK}>
              {`${h.siteAddress ?? 'Address not on file'}, parcel ${display.get(h.parcelId) ?? ''}`}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
