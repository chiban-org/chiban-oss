'use client'

import { useRouter } from 'next/navigation'
import { type Bbox, ParcelMap, type ParcelMapProps } from '@/components/map/ParcelMap'

interface LinkedParcelMapProps extends Omit<ParcelMapProps, 'onSelect' | 'bbox'> {
  hrefBase: string
  bbox?: Bbox | null
}

export function LinkedParcelMap({ hrefBase, bbox, ...rest }: LinkedParcelMapProps) {
  const router = useRouter()
  return (
    <ParcelMap
      {...rest}
      {...(bbox == null ? {} : { bbox })}
      onSelect={(parcelId) => router.push(`${hrefBase}${parcelId}`)}
    />
  )
}
