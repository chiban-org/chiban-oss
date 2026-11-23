import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { uuidArray } from '@/db/uuidList'
import type { OverlayFeature } from '@/features/abutters/overlay'
import { projectedSridParam } from '@/features/abutters/projection/srid'

export interface BufferedList {
  applicantParcelIds: string[]
  bufferFt: number | null
}

export async function bufferOverlay(
  tx: Tx,
  list: BufferedList,
  signal: AbortSignal,
): Promise<OverlayFeature | null> {
  signal.throwIfAborted()
  if (list.bufferFt === null || list.bufferFt <= 0 || list.applicantParcelIds.length === 0) {
    return null
  }
  const srid = projectedSridParam()
  const result = await tx.execute<{ gj: string | null }>(sql`
    select ST_AsGeoJSON(
      ST_Transform(ST_Buffer(ST_Transform(ST_Union(a.geom), ${srid}), ${list.bufferFt}), 4326),
      7
    ) as gj
    from parcels a where a.id = any(${uuidArray(list.applicantParcelIds)})
  `)
  const gj = result.rows[0]?.gj ?? null
  if (gj === null) return null
  return {
    type: 'Feature',
    properties: { kind: 'buffer' },
    geometry: JSON.parse(gj) as GeoJSON.Geometry,
  }
}
