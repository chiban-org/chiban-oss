import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { gisLayers } from '@/db/schema'

export type Bbox = [number, number, number, number]

export async function parcelExtent(db: DbOrTx, signal: AbortSignal): Promise<Bbox | null> {
  signal.throwIfAborted()
  const res = await db.execute<{ xmin: number | null; ymin: number; xmax: number; ymax: number }>(
    sql`SELECT ST_XMin(e) AS xmin, ST_YMin(e) AS ymin, ST_XMax(e) AS xmax, ST_YMax(e) AS ymax
        FROM (SELECT ST_Extent(geom) AS e FROM parcels WHERE status = 'active') t`,
  )
  const row = res.rows[0]
  if (row === undefined || row.xmin === null) return null
  return [row.xmin, row.ymin, row.xmax, row.ymax]
}

export function bboxOfGeometry(geom: GeoJSON.MultiPolygon): Bbox {
  const points = geom.coordinates.flat(2)
  const xs = points.map((p) => p[0] ?? 0)
  const ys = points.map((p) => p[1] ?? 0)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

export async function configuredOverlayLayers(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<('roads' | 'water')[]> {
  signal.throwIfAborted()
  const rows = await db.select({ key: gisLayers.key, adapter: gisLayers.adapter }).from(gisLayers)
  return rows.flatMap((r) =>
    r.adapter !== null && (r.key === 'roads' || r.key === 'water') ? [r.key] : [],
  )
}
