import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicParcelDetail } from '@/components/parcels/PublicParcelDetail'
import { db } from '@/db/client'
import { parcels } from '@/db/schema'
import { bboxOfGeometry, configuredOverlayLayers } from '@/features/gis/extent'
import { getPublicParcelView } from '@/features/parcels/publicParcelView'
import { getTownSettings } from '@/features/town/settings'

export const metadata: Metadata = { title: 'Parcel' }

interface PublicParcelPageProps {
  params: Promise<{ parcelId: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMEOUT_MS = 10_000
const FALLBACK_TIME_ZONE = 'America/New_York'

export default async function PublicParcelPage({ params }: PublicParcelPageProps) {
  const { parcelId } = await params
  if (!UUID.test(parcelId)) notFound()
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const result = await getPublicParcelView(db, parcelId, new Date(), signal)
  if (!result.ok) notFound()
  const [town, overlays] = await Promise.all([
    getTownSettings(db, signal),
    configuredOverlayLayers(db, signal),
  ])
  const [row] = result.value.hasGeometry
    ? await db.select({ geom: parcels.geom }).from(parcels).where(eq(parcels.id, parcelId))
    : []
  const bbox = row?.geom == null ? null : bboxOfGeometry(row.geom as GeoJSON.MultiPolygon)
  return (
    <PublicParcelDetail
      view={result.value}
      timeZone={town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE}
      overlays={overlays}
      basemap={
        town.ok
          ? { rasterUrl: town.value.basemapRasterUrl, attribution: town.value.basemapAttribution }
          : null
      }
      bbox={bbox}
    />
  )
}
