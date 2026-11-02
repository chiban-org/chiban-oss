'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { buildMapStyle } from '@/components/map/mapStyle'
import { MAPLIBRE_WORKER_URL } from '@/components/map/workerUrl'
import { TOKENS } from '@/features/design/tokens'

export type Bbox = [number, number, number, number]

export interface ParcelMapProps {
  selectedParcelId?: string
  bbox?: Bbox
  layers: ('roads' | 'water')[]
  onSelect: (parcelId: string) => void
  basemapRasterUrl?: string | null
  basemapAttribution?: string | null
  overlay?: GeoJSON.FeatureCollection<GeoJSON.Geometry, { kind: string }>
}

const OVERLAY_SOURCE = 'projection-overlay'
const NH_CENTER: [number, number] = [-71.5, 43.7]
const NH_ZOOM = 7
const FIT_PADDING_PX = 40
const SELECTED_LAYERS = ['parcel-selected-fill', 'parcel-selected-line'] as const

function addOverlay(map: MapLibreMap, overlay: NonNullable<ParcelMapProps['overlay']>): void {
  map.addSource(OVERLAY_SOURCE, { type: 'geojson', data: overlay })
  const only = (kind: string) => ['==', ['get', 'kind'], kind] as never
  map.addLayer({
    id: 'overlay-region',
    type: 'fill',
    source: OVERLAY_SOURCE,
    filter: only('region'),
    paint: { 'fill-color': '#1d4ed8', 'fill-opacity': 0.25 },
  })
  map.addLayer({
    id: 'overlay-capture',
    type: 'line',
    source: OVERLAY_SOURCE,
    filter: only('capture'),
    paint: { 'line-color': '#1d4ed8', 'line-width': 1.5, 'line-dasharray': [2, 2] },
  })
  map.addLayer({
    id: 'overlay-connector',
    type: 'line',
    source: OVERLAY_SOURCE,
    filter: only('connector'),
    paint: { 'line-color': '#111827', 'line-width': 2 },
  })
  map.addLayer({
    id: 'overlay-corner',
    type: 'circle',
    source: OVERLAY_SOURCE,
    filter: only('corner'),
    paint: { 'circle-radius': 5, 'circle-color': '#111827' },
  })
  map.addLayer({
    id: 'overlay-projected',
    type: 'circle',
    source: OVERLAY_SOURCE,
    filter: only('projected'),
    paint: {
      'circle-radius': 5,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#111827',
      'circle-stroke-width': 2,
    },
  })
}

export function ParcelMap(props: ParcelMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onSelect = useRef(props.onSelect)
  onSelect.current = props.onSelect
  const latest = useRef(props)
  latest.current = props
  const layerKey = props.layers.join(',')
  const overlayKey = JSON.stringify(props.overlay ?? null)
  const bboxKey = props.bbox?.join(',') ?? ''
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void import('maplibre-gl').then((maplibre) => {
      if (cancelled || container.current === null) return
      maplibre.setWorkerUrl(MAPLIBRE_WORKER_URL)
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
        const id: unknown = hit?.properties.parcel_id
        if (typeof id === 'string') onSelect.current(id)
      })
      const canvas = map.getCanvas()
      map.on('mouseenter', 'parcel-fill', () => {
        canvas.style.cursor = 'pointer'
      })
      map.on('mouseleave', 'parcel-fill', () => {
        canvas.style.cursor = ''
      })
      if (props.overlay !== undefined) {
        const overlay = props.overlay
        map.on('load', () => addOverlay(map, overlay))
      }
      if (props.bbox !== undefined)
        map.fitBounds(props.bbox, { padding: FIT_PADDING_PX, animate: false })
      map.once('idle', () => setLoading(false))
      mapRef.current = map
    })
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [layerKey, bboxKey, overlayKey, props.basemapRasterUrl, props.basemapAttribution])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || !map.isStyleLoaded()) return
    const filter = ['==', ['get', 'parcel_id'], props.selectedParcelId ?? '']
    for (const id of SELECTED_LAYERS) map.setFilter(id, filter as never)
  }, [props.selectedParcelId])

  return (
    <div>
      <div className="relative">
        <div
          ref={container}
          role="region"
          aria-label="Parcel map"
          className="h-[28rem] w-full rounded-lg border bg-canvas"
        />
        {loading ? (
          <p
            role="status"
            className="absolute inset-0 m-0 flex items-center justify-center rounded-lg bg-canvas/80 text-base font-medium"
          >
            Loading the map
          </p>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        The map is a visual aid. Use the search box to find a parcel with the keyboard.
      </p>
    </div>
  )
}
