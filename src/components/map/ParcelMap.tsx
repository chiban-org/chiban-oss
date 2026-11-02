'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { buildMapStyle } from '@/components/map/mapStyle'
import { TOKENS } from '@/features/design/tokens'

export type Bbox = [number, number, number, number]

export interface ParcelMapProps {
  selectedParcelId?: string
  bbox?: Bbox
  layers: ('roads' | 'water')[]
  onSelect(parcelId: string): void
  basemapRasterUrl?: string | null
  basemapAttribution?: string | null
}

const NH_CENTER: [number, number] = [-71.5, 43.7]
const NH_ZOOM = 7
const FIT_PADDING_PX = 40
const SELECTED_LAYERS = ['parcel-selected-fill', 'parcel-selected-line'] as const

export function ParcelMap(props: ParcelMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onSelect = useRef(props.onSelect)
  onSelect.current = props.onSelect
  const latest = useRef(props)
  latest.current = props
  const layerKey = props.layers.join(',')
  const bboxKey = props.bbox?.join(',') ?? ''

  useEffect(() => {
    let cancelled = false
    void import('maplibre-gl').then((maplibre) => {
      if (cancelled || container.current === null) return
      const map = new maplibre.Map({
        container: container.current,
        style: buildMapStyle({
          tokens: TOKENS,
          basemapRasterUrl: props.basemapRasterUrl ?? null,
          basemapAttribution: props.basemapAttribution ?? null,
          layers: props.layers,
          ...(props.selectedParcelId === undefined
            ? {}
            : { selectedParcelId: props.selectedParcelId }),
          tileBase: window.location.origin,
        }),
        center: NH_CENTER,
        zoom: NH_ZOOM,
        attributionControl: { compact: true },
      })
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right')
      map.on('click', (event) => {
        const hit = map.queryRenderedFeatures(event.point, { layers: ['parcel-fill'] })[0]
        const id = hit?.properties.parcel_id
        if (typeof id === 'string') onSelect.current(id)
      })
      map.on('mouseenter', 'parcel-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'parcel-fill', () => {
        map.getCanvas().style.cursor = ''
      })
      if (props.bbox !== undefined)
        map.fitBounds(props.bbox, { padding: FIT_PADDING_PX, animate: false })
      mapRef.current = map
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [
    layerKey,
    props.basemapRasterUrl,
    props.basemapAttribution,
    props.bbox,
    props.layers,
    props.selectedParcelId,
  ])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || !map.isStyleLoaded()) return
    const filter = ['==', ['get', 'parcel_id'], props.selectedParcelId ?? '']
    for (const id of SELECTED_LAYERS) map.setFilter(id, filter as never)
  }, [props.selectedParcelId])

  return (
    <div>
      <div
        ref={container}
        role="region"
        aria-label="Parcel map"
        className="h-[28rem] w-full rounded-lg border bg-canvas"
      />
      <p className="mt-2 text-sm text-muted-foreground">
        The map is a visual aid. Use the search box to find a parcel with the keyboard.
      </p>
    </div>
  )
}
