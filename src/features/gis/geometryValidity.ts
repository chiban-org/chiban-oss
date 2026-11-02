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
               ST_AsGeoJSON(ST_Multi(geom)) AS multi
        FROM g`,
  )
  const row = res.rows[0]
  if (row === undefined) return err({ reason: 'Geometry could not be evaluated' })
  if (!row.valid) return err({ reason: row.reason })
  return ok(JSON.parse(row.multi) as GeoJSON.MultiPolygon)
}
