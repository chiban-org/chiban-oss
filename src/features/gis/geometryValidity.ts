import { type SQL, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { coordinateIssue } from '@/features/gis/coordinateShape'
import { err, ok, type Result } from '@/types/result'

const POLYGONAL = new Set(['Polygon', 'MultiPolygon'])
const UNEVALUABLE = 'Geometry could not be evaluated'

async function evaluate<T extends Record<string, unknown>>(
  db: DbOrTx,
  query: SQL,
): Promise<T | undefined> {
  try {
    return await (db as Db).transaction(
      async (sp) => (await sp.execute<T>(query)).rows[0] as T | undefined,
    )
  } catch {
    return undefined
  }
}

export async function checkGeometry(
  db: DbOrTx,
  geom: GeoJSON.Geometry,
  signal: AbortSignal,
): Promise<Result<GeoJSON.MultiPolygon, { reason: string }>> {
  signal.throwIfAborted()
  if (!POLYGONAL.has(geom.type)) return err({ reason: `Unsupported geometry type ${geom.type}` })
  const shape = coordinateIssue(geom)
  if (shape !== null) return err({ reason: shape })
  const row = await evaluate<{ valid: boolean; empty: boolean; reason: string; multi: string }>(
    db,
    sql`WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geom)}), 4326) AS geom)
        SELECT ST_IsValid(geom) AS valid, ST_IsEmpty(geom) AS empty,
               ST_IsValidReason(geom) AS reason,
               ST_AsGeoJSON(ST_Multi(geom), 15) AS multi
        FROM g`,
  )
  if (row === undefined) return err({ reason: UNEVALUABLE })
  if (row.empty) return err({ reason: 'Geometry is empty' })
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
  const shape = coordinateIssue(geom)
  if (shape !== null) return err({ reason: shape })
  const row = await evaluate<{ valid: boolean; empty: boolean; reason: string }>(
    db,
    sql`WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geom)}), 4326) AS geom)
        SELECT ST_IsValid(geom) AS valid, ST_IsEmpty(geom) AS empty,
               ST_IsValidReason(geom) AS reason FROM g`,
  )
  if (row === undefined) return err({ reason: UNEVALUABLE })
  if (row.empty) return err({ reason: 'Geometry is empty' })
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
