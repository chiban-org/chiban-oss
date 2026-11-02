import type { LayerSpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl'
import type { TOKENS } from '@/features/design/tokens'

export interface MapStyleOptions {
  tokens: typeof TOKENS
  basemapRasterUrl: string | null
  basemapAttribution: string | null
  layers: ('roads' | 'water')[]
  selectedParcelId?: string
  tileBase?: string
}

const TILE_MIN_ZOOM = 10
const TILE_MAX_ZOOM = 20
const PARCEL_FILL_OPACITY = 0.04
const SELECTED_FILL_OPACITY = 0.25
const SELECTED_LINE_WIDTH = 3

function vectorSource(base: string, layer: string): SourceSpecification {
  return {
    type: 'vector',
    tiles: [`${base}/api/tiles/${layer}/{z}/{x}/{y}`],
    minzoom: TILE_MIN_ZOOM,
    maxzoom: TILE_MAX_ZOOM,
  }
}

function overlayLayers(opts: MapStyleOptions): LayerSpecification[] {
  const out: LayerSpecification[] = []
  if (opts.layers.includes('water')) {
    out.push({
      id: 'water-fill',
      type: 'fill',
      source: 'water',
      'source-layer': 'water',
      paint: { 'fill-color': opts.tokens['map-water-fill'] },
    })
  }
  if (opts.layers.includes('roads')) {
    out.push({
      id: 'roads-line',
      type: 'line',
      source: 'roads',
      'source-layer': 'roads',
      paint: { 'line-color': opts.tokens['map-road'], 'line-width': 2 },
    })
  }
  return out
}

export function buildMapStyle(opts: MapStyleOptions): StyleSpecification {
  const base = opts.tileBase ?? ''
  const sources: Record<string, SourceSpecification> = { parcels: vectorSource(base, 'parcels') }
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': opts.tokens.canvas } },
  ]
  if (opts.basemapRasterUrl !== null) {
    sources.basemap = {
      type: 'raster',
      tiles: [opts.basemapRasterUrl],
      tileSize: 256,
      ...(opts.basemapAttribution === null ? {} : { attribution: opts.basemapAttribution }),
    }
    layers.push({ id: 'basemap', type: 'raster', source: 'basemap' })
  }
  for (const key of opts.layers) sources[key] = vectorSource(base, key)
  layers.push(...overlayLayers(opts))
  const selected = ['==', ['get', 'parcel_id'], opts.selectedParcelId ?? '']
  layers.push(
    {
      id: 'parcel-fill',
      type: 'fill',
      source: 'parcels',
      'source-layer': 'parcels',
      paint: { 'fill-color': opts.tokens['map-parcel-line'], 'fill-opacity': PARCEL_FILL_OPACITY },
    },
    {
      id: 'parcel-line',
      type: 'line',
      source: 'parcels',
      'source-layer': 'parcels',
      paint: { 'line-color': opts.tokens['map-parcel-line'], 'line-width': 1 },
    },
    {
      id: 'parcel-selected-fill',
      type: 'fill',
      source: 'parcels',
      'source-layer': 'parcels',
      filter: selected as never,
      paint: { 'fill-color': opts.tokens['map-selected'], 'fill-opacity': SELECTED_FILL_OPACITY },
    },
    {
      id: 'parcel-selected-line',
      type: 'line',
      source: 'parcels',
      'source-layer': 'parcels',
      filter: selected as never,
      paint: { 'line-color': opts.tokens['map-selected'], 'line-width': SELECTED_LINE_WIDTH },
    },
  )
  return { version: 8, sources, layers }
}
