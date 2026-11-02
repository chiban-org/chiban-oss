import { z } from 'zod'
import type { SourceFeature } from '@/features/gis/import/types'
import type { ReaderError } from '@/features/gis/readers/types'
import { err, ok, type Result } from '@/types/result'

const GEOMETRY_TYPES = [
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
] as const

const geometrySchema = z.object({
  type: z.enum(GEOMETRY_TYPES),
  coordinates: z.array(z.unknown()),
})

const featureSchema = z.object({
  type: z.literal('Feature'),
  id: z.union([z.string(), z.number()]).optional(),
  properties: z.record(z.string(), z.unknown()).nullable(),
  geometry: geometrySchema.nullable(),
})

const collectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  crs: z.object({ properties: z.object({ name: z.string() }) }).optional(),
  features: z.array(featureSchema),
})

const WGS84_NAME = /(EPSG::?4326|CRS84)$/i

type Primitive = string | number | boolean | null

function primitive(v: unknown): Primitive {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return JSON.stringify(v)
}

export function parseGeoJsonValue(raw: unknown): Result<SourceFeature[], ReaderError> {
  const parsed = collectionSchema.safeParse(raw)
  if (!parsed.success) {
    return err({ kind: 'malformed', detail: 'File is not a GeoJSON FeatureCollection' })
  }
  const crsName = parsed.data.crs?.properties.name
  if (crsName !== undefined && !WGS84_NAME.test(crsName)) {
    return err({
      kind: 'unsupported_projection',
      detail: `Coordinate system ${crsName} is not supported`,
    })
  }
  return ok(
    parsed.data.features.map((f, i) => ({
      rowRef: f.id === undefined ? String(i) : String(f.id),
      properties: Object.fromEntries(
        Object.entries(f.properties ?? {}).map(([k, v]) => [k, primitive(v)]),
      ),
      geometry: f.geometry as GeoJSON.Geometry | null,
    })),
  )
}

export async function readGeoJson(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<Result<SourceFeature[], ReaderError>> {
  signal.throwIfAborted()
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return err({ kind: 'malformed', detail: 'File is not valid JSON' })
  }
  return parseGeoJsonValue(raw)
}
