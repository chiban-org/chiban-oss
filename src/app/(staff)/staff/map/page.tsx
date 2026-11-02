import { LinkedParcelMap } from '@/components/map/LinkedParcelMap'
import { parcelExtent } from '@/features/gis/extent'
import { getTownSettings } from '@/features/town/settings'
import { createContext } from '@/server/trpc/context'

export default async function StaffMapPage() {
  const ctx = await createContext()
  const town = await getTownSettings(ctx.db, ctx.signal)
  const bbox = await parcelExtent(ctx.db, ctx.signal)
  return (
    <main>
      <h1>Map</h1>
      {bbox === null ? (
        <p>No parcels have been imported yet. Import the parcel layer to see the map.</p>
      ) : null}
      <LinkedParcelMap
        hrefBase="/staff/parcels/"
        bbox={bbox}
        layers={['roads', 'water']}
        basemapRasterUrl={town.ok ? town.value.basemapRasterUrl : null}
        basemapAttribution={town.ok ? town.value.basemapAttribution : null}
      />
      <p className="mt-3">
        Select a parcel on the map to open its record, or{' '}
        <a href="/staff/parcels" className="text-action underline">
          search for a parcel
        </a>
        .
      </p>
    </main>
  )
}
