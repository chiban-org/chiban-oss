import type { Map as MapLibreMap } from 'maplibre-gl'

export type MapOverlay = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  { kind: string; text?: string }
>

const OVERLAY_SOURCE = 'projection-overlay'

export function addOverlay(map: MapLibreMap, overlay: MapOverlay): void {
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
