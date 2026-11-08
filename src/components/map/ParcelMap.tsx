'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { addOverlay, type MapOverlay } from '@/components/map/mapOverlay'
import { buildMapStyle, MAP_LOAD_TIMEOUT_MS, PARCEL_TILE_MIN_ZOOM } from '@/components/map/mapStyle'
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
  overlay?: MapOverlay
  hint?: string
  notLoaded?: string
  compact?: boolean
}

const SEARCH_HINT =
  'The map is a visual aid. Use the search box to find a parcel with the keyboard.'
const LABEL_CLASS = 'rounded bg-surface/90 px-1 text-sm font-medium text-foreground shadow-sm'

const NH_CENTER: [number, number] = [-71.5, 43.7]
const FIT_PADDING_PX = 40
const SELECTED_LAYERS = ['parcel-selected-fill', 'parcel-selected-line'] as const
const NOT_LOADED = 'The map did not load. Reload the page to try again, or search for the parcel.'

type LoadPhase = 'loading' | 'ready' | 'failed'

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
  const [phase, setPhase] = useState<LoadPhase>('loading')

  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    const overdue = setTimeout(() => {
      if (!cancelled) setPhase((now) => (now === 'loading' ? 'failed' : now))
    }, MAP_LOAD_TIMEOUT_MS)
    const loaded = import('maplibre-gl').then((maplibre) => {
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
        zoom: PARCEL_TILE_MIN_ZOOM,
        minZoom: PARCEL_TILE_MIN_ZOOM,
        attributionControl: { compact: true },
      })
      mapRef.current = map
      map.once('idle', () => {
        clearTimeout(overdue)
        if (!cancelled) setPhase('ready')
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
        map.on('load', () => {
          addOverlay(map, overlay)
          for (const feature of overlay.features) {
            if (feature.properties.kind !== 'label' || feature.geometry.type !== 'Point') continue
            const element = document.createElement('span')
            element.className = LABEL_CLASS
            element.textContent = feature.properties.text ?? ''
            const [lon = 0, lat = 0] = feature.geometry.coordinates
            new maplibre.Marker({ element }).setLngLat([lon, lat]).addTo(map)
          }
        })
      }
      if (props.bbox !== undefined)
        map.fitBounds(props.bbox, { padding: FIT_PADDING_PX, animate: false })
    })
    loaded.catch(() => {
      clearTimeout(overdue)
      if (!cancelled) setPhase('failed')
    })
    return () => {
      cancelled = true
      clearTimeout(overdue)
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
          className={`${props.compact === true ? 'h-64' : 'h-[28rem]'} w-full rounded-lg border bg-canvas`}
        />
        {phase === 'ready' ? null : (
          <p
            role={phase === 'failed' ? 'alert' : 'status'}
            className="absolute inset-0 m-0 flex items-center justify-center rounded-lg bg-canvas/80 px-6 text-center text-base font-medium"
          >
            {phase === 'failed' ? (props.notLoaded ?? NOT_LOADED) : 'Loading the map'}
          </p>
        )}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{props.hint ?? SEARCH_HINT}</p>
    </div>
  )
}
