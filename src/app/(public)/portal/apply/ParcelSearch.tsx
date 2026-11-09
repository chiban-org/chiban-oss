import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { displayIdsFor } from '@/features/parcels/displayId'
import { searchParcels } from '@/features/parcels/searchParcels'
import { byHouseNumber } from '@/features/portal/parcelOrder'
import type { PortalContext } from '@/server/requirePortal'

const LINK = 'tap-target inline-flex items-center'
const MIN_QUERY = 2

export async function parcelSearch(ctx: PortalContext, q: string) {
  const query = q.trim()
  const found =
    query.length >= MIN_QUERY ? await searchParcels(ctx.db, { q: query }, ctx.signal) : []
  const hits = byHouseNumber(found)
  const display = await displayIdsFor(
    ctx.db,
    hits.map((h) => h.parcelId),
  )
  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="parcel-search" className="text-base">
            Find your parcel by address, owner, or parcel ID
          </Label>
          <Input id="parcel-search" name="q" defaultValue={query} className="min-h-11 text-base" />
        </div>
        <Button type="submit" className="min-h-11 text-base">
          Search
        </Button>
      </form>
      {q !== '' && query.length < MIN_QUERY ? <p>Enter at least two characters.</p> : null}
      {query.length >= MIN_QUERY && hits.length === 0 ? <p>No parcels match that search.</p> : null}
      <ul className="list-none divide-y p-0">
        {hits.map((h) => (
          <li key={h.parcelId} className="py-2">
            {h.status === 'retired' ? (
              <p className="m-0">
                {`${h.siteAddress ?? 'Address not on file'}, parcel ${display.get(h.parcelId) ?? ''}. Retired: takes no new applications.`}
              </p>
            ) : (
              <Link href={`/portal/apply?parcel=${h.parcelId}`} className={LINK}>
                {`${h.siteAddress ?? 'Address not on file'}, parcel ${display.get(h.parcelId) ?? ''}`}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
