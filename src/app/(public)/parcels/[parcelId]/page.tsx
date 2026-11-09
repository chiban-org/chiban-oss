import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { PublicParcelDetail, parcelTitle } from '@/components/parcels/PublicParcelDetail'
import { db } from '@/db/client'
import { parcels } from '@/db/schema'
import { bboxOfGeometry, configuredOverlayLayers } from '@/features/gis/extent'
import { getPublicParcelView } from '@/features/parcels/publicParcelView'
import { loadPublicTown } from '@/features/town/publicTown'
import { getTownSettings } from '@/features/town/settings'

interface PublicParcelPageProps {
  params: Promise<{ parcelId: string }>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMEOUT_MS = 10_000
const FALLBACK_TIME_ZONE = 'America/New_York'

const loadView = cache(async (parcelId: string) =>
  UUID.test(parcelId)
    ? await getPublicParcelView(db, parcelId, new Date(), AbortSignal.timeout(TIMEOUT_MS))
    : null,
)

export async function generateMetadata({ params }: PublicParcelPageProps): Promise<Metadata> {
  const result = await loadView((await params).parcelId)
  return { title: result?.ok === true ? parcelTitle(result.value).title : 'Parcel' }
}

export default async function PublicParcelPage({ params }: PublicParcelPageProps) {
  const { parcelId } = await params
  const result = await loadView(parcelId)
  if (result === null || !result.ok) notFound()
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const [town, overlays, publicTown] = await Promise.all([
    getTownSettings(db, signal),
    configuredOverlayLayers(db, signal),
    loadPublicTown(db, signal),
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
      office={publicTown.office}
      bbox={bbox}
    />
  )
}
