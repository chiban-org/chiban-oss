import { exceptionKindLabel } from '@/features/gis/exceptionLabels'
import { formatInstantLong } from '@/lib/formatDate'
import { words } from '@/lib/words'

const ADAPTER_LABELS = new Map<string, string>([
  ['file_geojson', 'GeoJSON file'],
  ['file_shapefile', 'Shapefile'],
  ['file_geopackage', 'GeoPackage file'],
  ['esri_rest', 'Esri REST feature service'],
  ['axisgis', 'AxisGIS'],
  ['file_cama_csv', 'CAMA CSV file'],
])

const LAYER_LABELS = new Map<string, string>([
  ['parcels', 'Parcels'],
  ['roads', 'Roads'],
  ['water', 'Water'],
  ['cama', 'CAMA owner data'],
])

const ROW_KEY_PREFIXES = new Map<string, string>([
  ['id', 'parcel ID'],
  ['line', 'line'],
  ['src', 'source feature'],
])

export function exceptionSubject(rowKey: string): string {
  const colon = rowKey.indexOf(':')
  const prefix = ROW_KEY_PREFIXES.get(rowKey.slice(0, Math.max(colon, 0)))
  return colon < 0 || prefix === undefined ? rowKey : `${prefix} ${rowKey.slice(colon + 1)}`
}

export function exceptionTitle(kind: string, rowKey: string): string {
  return `${exceptionKindLabel(kind)}: ${exceptionSubject(rowKey)}`
}

export function adapterLabel(adapter: string): string {
  return ADAPTER_LABELS.get(adapter) ?? words(adapter)
}

export function layerLabel(layerKey: string): string {
  return LAYER_LABELS.get(layerKey) ?? words(layerKey)
}

export function importRunSummary(
  run: { layerKey: string; adapter: string; startedAt: Date; status: string },
  timeZone: string,
): string {
  return `${layerLabel(run.layerKey)} from ${adapterLabel(run.adapter)}, started ${formatInstantLong(run.startedAt, timeZone)}. Status: ${words(run.status)}.`
}

export function exceptionDetailText(detail: string, createdAt: Date, timeZone: string): string {
  return `${detail}. First seen ${formatInstantLong(createdAt, timeZone)}.`
}
