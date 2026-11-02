import type { AbutterParams } from '@packs/nh/schema'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { uuidArray } from '@/db/uuidList'
import { loadCrossingInputs } from '@/features/abutters/crossingInputs'
import { projectionParamsFor } from '@/features/abutters/projection/paramsFor'
import { projectAcross } from '@/features/abutters/projection/projectAcross'
import type { Pt } from '@/features/abutters/projection/types'
import { displayIdsFor } from '@/features/parcels/displayId'

export type OverlayKind = 'region' | 'corner' | 'projected' | 'connector' | 'capture' | 'label'

export type Overlay = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  { kind: OverlayKind; text?: string }
>

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
  if (features.length > 0) {
    const labelled = [...applicantParcelIds, ...inputs.others.map((o) => o.parcelId)]
    features.push(...(await parcelLabels(tx, labelled)))
    features.push(
      ...(await featureLabels(
        tx,
        inputs.features.map((f) => f.id),
      )),
    )
  }
  return { type: 'FeatureCollection', features }
}

type LabelFeature = Overlay['features'][number]

function labelAt(text: string, gj: string): LabelFeature {
  return {
    type: 'Feature',
    properties: { kind: 'label', text },
    geometry: JSON.parse(gj) as GeoJSON.Geometry,
  }
}

async function parcelLabels(tx: Tx, parcelIds: string[]): Promise<LabelFeature[]> {
  if (parcelIds.length === 0) return []
  const labels = await displayIdsFor(tx, parcelIds)
  const rows = await tx.execute<{ id: string; gj: string }>(sql`
    select p.id, ST_AsGeoJSON(ST_Transform(ST_PointOnSurface(p.geom), 4326), 7) as gj
    from parcels p where p.id = any(${uuidArray(parcelIds)}) and p.geom is not null
  `)
  return rows.rows.flatMap((r) => {
    const text = labels.get(r.id)
    return text === undefined ? [] : [labelAt(text, r.gj)]
  })
}

async function featureLabels(tx: Tx, featureIds: string[]): Promise<LabelFeature[]> {
  if (featureIds.length === 0) return []
  const rows = await tx.execute<{ name: string; gj: string }>(sql`
    select f.name, ST_AsGeoJSON(ST_Transform(ST_PointOnSurface(f.geom), 4326), 7) as gj
    from gis_features f where f.id = any(${uuidArray(featureIds)}) and f.name is not null
  `)
  return rows.rows.map((r) => labelAt(r.name, r.gj))
}
