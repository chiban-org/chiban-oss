import { eq, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { gisLayers } from '@/db/schema'
import { err, ok, type Result } from '@/types/result'

export type TileLayer = 'parcels' | 'roads' | 'water'
export type TileError = 'bad_tile' | 'layer_not_configured'

const MIN_ZOOM = 10
const MAX_ZOOM = 20
const EXTENT = 4096
const BUFFER = 64
const FULL_DETAIL_ZOOM = 15
const WORLD_METERS = 40075016.686
const PROJECTABLE_LATITUDE = 85.0511
const PROJECTABLE_LONGITUDE = 180

function projectable(column: SQL) {
  return sql`ST_XMin(${column}) >= ${-PROJECTABLE_LONGITUDE} AND ST_XMax(${column}) <= ${PROJECTABLE_LONGITUDE}
    AND ST_YMin(${column}) >= ${-PROJECTABLE_LATITUDE} AND ST_YMax(${column}) <= ${PROJECTABLE_LATITUDE}`
}

function inRange(z: number, x: number, y: number): boolean {
  if (![z, x, y].every(Number.isInteger) || z < MIN_ZOOM || z > MAX_ZOOM) return false
  const n = 2 ** z
  return x >= 0 && x < n && y >= 0 && y < n
}

function parcelTile(z: number, x: number, y: number) {
  return sql`
    WITH env AS (
      SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS e,
        CASE WHEN ${z} < ${FULL_DETAIL_ZOOM} THEN ${WORLD_METERS} / (2 ^ ${z}) / ${EXTENT} ELSE 0 END AS tolerance
    ),
    clipped AS (
      SELECT p.id, p.status,
        ST_AsMVTGeom(
          CASE WHEN env.tolerance > 0
            THEN ST_SimplifyPreserveTopology(ST_Transform(p.geom, 3857), env.tolerance)
            ELSE ST_Transform(p.geom, 3857) END,
          env.e, ${EXTENT}, ${BUFFER}, true) AS geom
      FROM parcels p, env
      WHERE p.geom && ST_Transform(env.e, 4326) AND ${projectable(sql`p.geom`)}
    ),
    mvt AS (
      SELECT c.id::text AS parcel_id,
        (SELECT a.value FROM parcel_aliases a JOIN parcel_id_formats f ON f.key = a.format AND f.is_display
           WHERE a.parcel_id = c.id ORDER BY (a.status = 'active') DESC, a.value LIMIT 1) AS display_id,
        c.status AS status,
        c.geom AS geom
      FROM clipped c WHERE c.geom IS NOT NULL
    )
    SELECT ST_AsMVT(mvt.*, 'parcels', ${EXTENT}, 'geom') AS tile FROM mvt`
}

function featureTile(layer: TileLayer, z: number, x: number, y: number) {
  return sql`
    WITH env AS (SELECT ST_TileEnvelope(${z}, ${x}, ${y}) AS e),
    mvt AS (
      SELECT f.name AS name,
        ST_AsMVTGeom(ST_Transform(f.geom, 3857), env.e, ${EXTENT}, ${BUFFER}, true) AS geom
      FROM gis_features f, env
      WHERE f.layer_key = ${layer} AND f.geom && ST_Transform(env.e, 4326)
        AND ${projectable(sql`f.geom`)}
    )
    SELECT ST_AsMVT(mvt.*, ${layer}, ${EXTENT}, 'geom') AS tile FROM mvt WHERE geom IS NOT NULL`
}

export async function tileFor(
  db: DbOrTx,
  layer: TileLayer,
  z: number,
  x: number,
  y: number,
  signal: AbortSignal,
): Promise<Result<Uint8Array, TileError>> {
  signal.throwIfAborted()
  if (!inRange(z, x, y)) return err('bad_tile')
  if (layer !== 'parcels') {
    const [row] = await db
      .select({ adapter: gisLayers.adapter })
      .from(gisLayers)
      .where(eq(gisLayers.key, layer))
    if (row?.adapter == null) return err('layer_not_configured')
  }
  const query = layer === 'parcels' ? parcelTile(z, x, y) : featureTile(layer, z, x, y)
  const res = await db.execute<{ tile: Buffer | null }>(query)
  return ok(new Uint8Array(res.rows[0]?.tile ?? Buffer.alloc(0)))
}
