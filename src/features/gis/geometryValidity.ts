import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { err, ok, type Result } from '@/types/result'

const POLYGONAL = new Set(['Polygon', 'MultiPolygon'])

export async function checkGeometry(
  db: DbOrTx,
  geom: GeoJSON.Geometry,
  signal: AbortSignal,
): Promise<Result<GeoJSON.MultiPolygon, { reason: string }>> {
  signal.throwIfAborted()
  if (!POLYGONAL.has(geom.type)) return err({ reason: `Unsupported geometry type ${geom.type}` })
  const json = JSON.stringify(geom)
  const res = await db.execute<{ valid: boolean; reason: string; multi: string }>(
    sql`WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${json}), 4326) AS geom)
        SELECT ST_IsValid(geom) AS valid, ST_IsValidReason(geom) AS reason,
               ST_AsGeoJSON(ST_Multi(geom), 15) AS multi
        FROM g`,
  )
  const row = res.rows[0]
  if (row === undefined) return err({ reason: 'Geometry could not be evaluated' })
  if (!row.valid) return err({ reason: row.reason })
  return ok(JSON.parse(row.multi) as GeoJSON.MultiPolygon)
}

const ANY_SHAPE = new Set(['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'])

export async function checkAnyGeometry(
  db: DbOrTx,
  geom: GeoJSON.Geometry,
  signal: AbortSignal,
): Promise<Result<GeoJSON.Geometry, { reason: string }>> {
  signal.throwIfAborted()
  if (!ANY_SHAPE.has(geom.type)) return err({ reason: `Unsupported geometry type ${geom.type}` })
  const res = await db.execute<{ valid: boolean; reason: string }>(
    sql`WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geom)}), 4326) AS geom)
        SELECT ST_IsValid(geom) AS valid, ST_IsValidReason(geom) AS reason FROM g`,
  )
  const row = res.rows[0]
  if (row === undefined) return err({ reason: 'Geometry could not be evaluated' })
  return row.valid ? ok(geom) : err({ reason: row.reason })
}

export async function unionToMultiPolygon(
  db: DbOrTx,
  parts: GeoJSON.Geometry[],
  signal: AbortSignal,
): Promise<GeoJSON.MultiPolygon> {
  signal.throwIfAborted()
  const res = await db.execute<{ merged: string }>(
    sql`SELECT ST_AsGeoJSON(ST_Multi(ST_Union(ST_SetSRID(ST_GeomFromGeoJSON(part), 4326))), 15) AS merged
        FROM jsonb_array_elements_text(${JSON.stringify(parts.map((p) => JSON.stringify(p)))}::jsonb) AS part`,
  )
  return JSON.parse(res.rows[0]?.merged ?? 'null') as GeoJSON.MultiPolygon
}
