import type { AbutterParams } from '@packs/nh/schema'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { loadCrossingInputs } from '@/features/abutters/crossingInputs'
import { projectionParamsFor } from '@/features/abutters/projection/paramsFor'
import { projectAcross } from '@/features/abutters/projection/projectAcross'
import type { Pt } from '@/features/abutters/projection/types'

export type OverlayKind = 'region' | 'corner' | 'projected' | 'connector' | 'capture'

export type Overlay = GeoJSON.FeatureCollection<GeoJSON.Geometry, { kind: OverlayKind }>

const NEARBY_MARGIN_FT = 50

function wkt(kind: 'POINT' | 'LINESTRING' | 'POLYGON', points: Pt[]): string {
  const text = points.map((p) => `${p[0]} ${p[1]}`).join(', ')
  return kind === 'POINT'
    ? `POINT(${text})`
    : kind === 'POLYGON'
      ? `POLYGON((${text}))`
      : `LINESTRING(${text})`
}

async function toLonLat(
  tx: Tx,
  geometryWkt: string,
  bufferFt: number | null,
): Promise<GeoJSON.Geometry> {
  const base = sql`ST_GeomFromText(${geometryWkt}, 3437)`
  const shaped = bufferFt === null ? base : sql`ST_Buffer(${base}, ${bufferFt})`
  const result = await tx.execute<{ gj: string }>(
    sql`select ST_AsGeoJSON(ST_Transform(${shaped}, 4326), 7) as gj`,
  )
  return JSON.parse(result.rows[0]?.gj ?? 'null') as GeoJSON.Geometry
}

export async function projectionOverlay(
  tx: Tx,
  applicantParcelIds: string[],
  params: AbutterParams,
  assumedRightOfWayFt: number,
  signal: AbortSignal,
): Promise<Overlay> {
  const radius = params.maxCrossingFt + params.captureRadiusFt + NEARBY_MARGIN_FT
  const inputs = await loadCrossingInputs(tx, applicantParcelIds, radius, signal)
  const result = projectAcross({
    applicantRings: inputs.applicantRings,
    others: inputs.others,
    features: inputs.features,
    params: projectionParamsFor(params, assumedRightOfWayFt),
  })
  const features: Overlay['features'] = []
  const add = async (
    kind: OverlayKind,
    geometryWkt: string,
    bufferFt: number | null = null,
  ): Promise<void> => {
    features.push({
      type: 'Feature',
      properties: { kind },
      geometry: await toLonLat(tx, geometryWkt, bufferFt),
    })
  }
  for (const region of result.regions)
    await add('region', wkt('POLYGON', [...region, region[0] as Pt]))
  for (const point of result.points) {
    await add('connector', wkt('LINESTRING', [point.corner, point.point]))
    await add('corner', wkt('POINT', [point.corner]))
    await add('projected', wkt('POINT', [point.point]))
    await add('capture', wkt('POINT', [point.point]), params.captureRadiusFt)
  }
  return { type: 'FeatureCollection', features }
}
