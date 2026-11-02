import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { uuidArray } from '@/db/uuidList'
import type { CrossingFeature, OtherParcel, Pt } from '@/features/abutters/projection/types'

export interface CrossingInputs {
  applicantRings: Pt[][]
  others: OtherParcel[]
  features: CrossingFeature[]
}

type GeoJsonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'GeometryCollection'; geometries: GeoJsonGeometry[] }

function toPoints(coordinates: number[][]): Pt[] {
  return coordinates.map((c) => [c[0] ?? 0, c[1] ?? 0] as Pt)
}

export function exteriorRings(geometry: GeoJsonGeometry): Pt[][] {
  switch (geometry.type) {
    case 'Polygon':
      return geometry.coordinates.slice(0, 1).map(toPoints)
    case 'MultiPolygon':
      return geometry.coordinates.flatMap((polygon) => polygon.slice(0, 1).map(toPoints))
    case 'GeometryCollection':
      return geometry.geometries.flatMap(exteriorRings)
    case 'LineString':
    case 'MultiLineString':
      return []
  }
}

export function allRings(geometry: GeoJsonGeometry): Pt[][] {
  switch (geometry.type) {
    case 'Polygon':
      return geometry.coordinates.map(toPoints)
    case 'MultiPolygon':
      return geometry.coordinates.flatMap((polygon) => polygon.map(toPoints))
    case 'GeometryCollection':
      return geometry.geometries.flatMap(allRings)
    case 'LineString':
    case 'MultiLineString':
      return []
  }
}

function linePaths(geometry: GeoJsonGeometry): Pt[][] {
  switch (geometry.type) {
    case 'LineString':
      return [toPoints(geometry.coordinates)]
    case 'MultiLineString':
      return geometry.coordinates.map(toPoints)
    case 'GeometryCollection':
      return geometry.geometries.flatMap(linePaths)
    case 'Polygon':
    case 'MultiPolygon':
      return []
  }
}

function featureOf(row: {
  id: string
  layer_key: string
  name: string | null
  gj: string
}): CrossingFeature | null {
  const geometry = JSON.parse(row.gj) as GeoJsonGeometry
  const layer = row.layer_key === 'roads' ? 'roads' : 'water'
  const rings = exteriorRings(geometry)
  if (rings.length > 0) {
    return { id: row.id, layer, name: row.name, geometry: { kind: 'area', rings } }
  }
  const paths = linePaths(geometry)
  return paths.length === 0
    ? null
    : { id: row.id, layer, name: row.name, geometry: { kind: 'line', paths } }
}

export async function loadCrossingInputs(
  tx: DbOrTx,
  applicantParcelIds: string[],
  radiusFt: number,
  signal: AbortSignal,
): Promise<CrossingInputs> {
  signal.throwIfAborted()
  if (applicantParcelIds.length === 0) return { applicantRings: [], others: [], features: [] }
  const union = sql`(select ST_Transform(ST_Union(a.geom), 3437) from parcels a where a.id = any(${uuidArray(applicantParcelIds)}))`
  const applicant = await tx.execute<{ gj: string | null }>(
    sql`select ST_AsGeoJSON(${union}, 4) as gj`,
  )
  const nearby = await tx.execute<{ id: string; gj: string }>(sql`
    select p.id, ST_AsGeoJSON(ST_Transform(p.geom, 3437), 4) as gj
    from parcels p
    where p.geom is not null and p.status = 'active'
      and p.id <> all(${uuidArray(applicantParcelIds)})
      and ST_DWithin(ST_Transform(p.geom, 3437), ${union}, ${radiusFt})
    order by p.id
  `)
  const features = await tx.execute<{
    id: string
    layer_key: string
    name: string | null
    gj: string
  }>(sql`
    select f.id, f.layer_key, f.name, ST_AsGeoJSON(ST_Transform(f.geom, 3437), 4) as gj
    from gis_features f
    where f.layer_key in ('roads', 'water')
      and ST_DWithin(ST_Transform(f.geom, 3437), ${union}, ${radiusFt})
    order by f.layer_key, f.source_key
  `)
  const applicantJson = applicant.rows[0]?.gj ?? null
  return {
    applicantRings:
      applicantJson === null ? [] : allRings(JSON.parse(applicantJson) as GeoJsonGeometry),
    others: nearby.rows.map((r) => ({
      parcelId: r.id,
      rings: allRings(JSON.parse(r.gj) as GeoJsonGeometry),
    })),
    features: features.rows.flatMap((r) => {
      const f = featureOf(r)
      return f === null ? [] : [f]
    }),
  }
}
