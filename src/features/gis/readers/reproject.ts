import proj4 from 'proj4'
import type { ReaderError } from '@/features/gis/readers/types'
import { err, ok, type Result } from '@/types/result'

type Position = number[]

function mapPositions(coords: unknown, fn: (p: Position) => Position): unknown {
  if (Array.isArray(coords) && typeof coords[0] === 'number') return fn(coords as Position)
  return (coords as unknown[]).map((c) => mapPositions(c, fn))
}

export function reprojectTo4326(
  geom: GeoJSON.Geometry,
  sourceWkt: string,
): Result<GeoJSON.Geometry, ReaderError> {
  try {
    const convert = proj4(sourceWkt, 'EPSG:4326')
    const transform = (p: Position): Position => {
      const [lon, lat] = convert.forward([p[0] ?? 0, p[1] ?? 0])
      if (!Number.isFinite(lon) || !Number.isFinite(lat))
        throw new RangeError('non-finite coordinate')
      return [lon, lat]
    }
    if (geom.type === 'GeometryCollection') {
      return err({ kind: 'malformed', detail: 'Geometry collections are not supported' })
    }
    return ok({
      ...geom,
      coordinates: mapPositions(geom.coordinates, transform),
    } as GeoJSON.Geometry)
  } catch (e) {
    return err({
      kind: 'unsupported_projection',
      detail: e instanceof Error ? e.message : 'Projection could not be applied',
    })
  }
}
