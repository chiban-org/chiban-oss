import Link from 'next/link'
import { bboxOfGeometry } from '@/features/gis/extent'
import type { NearbyParcel } from '@/features/parcels/nearbyParcels'
import { MapFold } from './MapFold'
import type { ParcelPageData } from './parcelPageData'

const MAP_NOT_LOADED = 'The map did not load. Reload the page to try again.'

export function staffMapHint(nearbyCount: number): string {
  const keyboard =
    nearbyCount === 0
      ? 'Use the search box to find a parcel with the keyboard.'
      : 'Use the search box or the nearby parcel links to find a parcel with the keyboard.'
  return `The map is a visual aid. Select a neighboring parcel on it to open that parcel. ${keyboard}`
}

function nearbyName(parcel: NearbyParcel): string {
  return parcel.siteAddress ?? parcel.displayId ?? 'Parcel with no address or map-lot ID'
}

function NearbyParcels({ parcels }: { parcels: readonly NearbyParcel[] }) {
  if (parcels.length === 0) return null
  return (
    <>
      <h3 id="nearby-heading" className="text-base font-semibold">
        Nearby parcels
      </h3>
      <ul
        aria-labelledby="nearby-heading"
        className="flex list-none flex-wrap gap-x-5 gap-y-2 p-0"
      >
        {parcels.map((p) => (
          <li key={p.parcelId}>
            <Link href={`/staff/parcels/${p.parcelId}`} className="tap-target">
              {nearbyName(p)}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

export function ParcelMapPanel({ data }: { data: ParcelPageData }) {
  const geometry = data.view.geometry
  if (geometry.state !== 'known' && geometry.state !== 'stale') return null
  return (
    <section id="map" aria-labelledby="map-heading" className="flex flex-col gap-3">
      <h2 id="map-heading">Map and nearby parcels</h2>
      <MapFold
        hrefBase="/staff/parcels/"
        selectedParcelId={data.parcelId}
        bbox={bboxOfGeometry(geometry.value)}
        layers={data.map.overlays}
        basemapRasterUrl={data.map.basemapRasterUrl}
        basemapAttribution={data.map.basemapAttribution}
        hint={staffMapHint(data.nearby.length)}
        notLoaded={MAP_NOT_LOADED}
        compact
      />
      <NearbyParcels parcels={data.nearby} />
    </section>
  )
}
