import Link from 'next/link'
import { LinkedParcelMap } from '@/components/map/LinkedParcelMap'
import { MoreMatchesNotice } from '@/components/parcels/MoreMatchesNotice'
import { ParcelSearchBox } from '@/components/parcels/PublicParcelDetail'
import { db } from '@/db/client'
import { configuredOverlayLayers, parcelExtent } from '@/features/gis/extent'
import { searchParcelPage } from '@/features/parcels/searchParcels'
import { getTownSettings } from '@/features/town/settings'

interface PublicParcelsPageProps {
  searchParams: Promise<{ q?: string }>
}

const TIMEOUT_MS = 10_000

export default async function PublicParcelsPage({ searchParams }: PublicParcelsPageProps) {
  const { q = '' } = await searchParams
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const { hits, more } =
    q.trim().length < 2 ? { hits: [], more: false } : await searchParcelPage(db, q, signal)
  const [town, bbox, overlays] = await Promise.all([
    getTownSettings(db, signal),
    parcelExtent(db, signal),
    configuredOverlayLayers(db, signal),
  ])
  return (
    <main className="text-base">
      <h1>Parcel lookup</h1>
      <ParcelSearchBox defaultValue={q} />
      {q.trim().length === 0 ? null : q.trim().length < 2 ? (
        <p>Enter at least two characters.</p>
      ) : hits.length === 0 ? (
        <p>No parcels match that search.</p>
      ) : (
        <>
          <MoreMatchesNotice more={more} />
          <ul className="mb-6 divide-y">
            {hits.map((hit) => (
              <li key={hit.parcelId} className="py-3">
                <Link
                  href={`/parcels/${hit.parcelId}`}
                  className="tap-target text-lg font-semibold text-action underline"
                >
                  {hit.displayId ?? 'Parcel'}
                </Link>
                {hit.status === 'retired' ? <span className="ml-2">Retired</span> : null}
                <p>{hit.siteAddress ?? 'Address unknown'}</p>
                {hit.matchedAlias?.status === 'retired' ? (
                  <p className="text-muted-foreground">{`Matched the retired ID ${hit.matchedAlias.value}`}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {bbox === null ? null : (
        <LinkedParcelMap
          hrefBase="/parcels/"
          bbox={bbox}
          layers={overlays}
          basemapRasterUrl={town.ok ? town.value.basemapRasterUrl : null}
          basemapAttribution={town.ok ? town.value.basemapAttribution : null}
        />
      )}
    </main>
  )
}
