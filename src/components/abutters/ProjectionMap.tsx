'use client'

import { useRouter } from 'next/navigation'
import { type Bbox, ParcelMap } from '@/components/map/ParcelMap'
import type { Overlay } from '@/features/abutters/overlay'

interface Props {
  overlay: Overlay
  bbox: Bbox | null
  basemapRasterUrl: string | null
  basemapAttribution: string | null
  captureRadiusFt: number
}

export function ProjectionMap({
  overlay,
  bbox,
  basemapRasterUrl,
  basemapAttribution,
  captureRadiusFt,
}: Props) {
  const router = useRouter()
  return (
    <div>
      <ParcelMap
        layers={['roads', 'water']}
        overlay={overlay}
        {...(bbox === null ? {} : { bbox })}
        basemapRasterUrl={basemapRasterUrl}
        basemapAttribution={basemapAttribution}
        onSelect={(parcelId) => router.push(`/staff/parcels/${parcelId}`)}
      />
      <ul className="mt-2 flex list-none flex-wrap gap-4 p-0 text-sm">
        <li>Dark dots: corners of the property facing the street or stream</li>
        <li>Open dots: where the perpendicular lines meet property across</li>
        <li>Shaded bands: parcels inside are abutters</li>
        <li>{`Circles: the ${captureRadiusFt} foot capture area around each open dot`}</li>
      </ul>
    </div>
  )
}
