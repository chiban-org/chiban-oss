import type { Metadata } from 'next'
import { LinkedParcelMap } from '@/components/map/LinkedParcelMap'
import { ParcelSearch } from '@/components/public/ParcelSearch'
import { ParcelSearchResults } from '@/components/public/ParcelSearchResults'
import { db } from '@/db/client'
import { configuredOverlayLayers, parcelExtent } from '@/features/gis/extent'
import { byHouseNumber } from '@/features/parcels/houseNumberOrder'
import { searchExample } from '@/features/parcels/searchExample'
import { searchParcelPage } from '@/features/parcels/searchParcels'
import { getTownSettings } from '@/features/town/settings'

export const metadata: Metadata = { title: 'Parcels' }

interface PublicParcelsPageProps {
  searchParams: Promise<{ q?: string }>
}

const TIMEOUT_MS = 10_000
const MIN_QUERY_CHARS = 2

export default async function PublicParcelsPage({ searchParams }: PublicParcelsPageProps) {
  const { q = '' } = await searchParams
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const { hits, more } =
    q.trim().length < MIN_QUERY_CHARS
      ? { hits: [], more: false }
      : await searchParcelPage(db, q, signal)
  const [town, bbox, overlays, example] = await Promise.all([
    getTownSettings(db, signal),
    parcelExtent(db, signal),
    configuredOverlayLayers(db, signal),
    searchExample(db, signal),
  ])
  return (
    <main className="text-base">
      <h1>Parcels</h1>
      <p>See the permits, applications, and board decisions on file for any parcel in town.</p>
      <section data-plain>
        <ParcelSearch defaultValue={q} example={example} />
      </section>
      <ParcelSearchResults q={q} hits={byHouseNumber(hits)} more={more} />
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
