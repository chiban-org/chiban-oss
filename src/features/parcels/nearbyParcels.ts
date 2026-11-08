import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { displayIdsFor } from '@/features/parcels/displayId'

const NEARBY_METERS = 200
const MOST_LISTED = 8

export interface NearbyParcel {
  parcelId: string
  displayId: string | null
  siteAddress: string | null
}

export async function loadNearbyParcels(
  db: DbOrTx,
  parcelId: string,
  signal: AbortSignal,
): Promise<NearbyParcel[]> {
  signal.throwIfAborted()
  const result = await db.execute<{ id: string; site_address: string | null }>(sql`
    select p.id, p.site_address
    from parcels p, parcels here
    where here.id = ${parcelId}::uuid
      and p.id <> here.id
      and p.status = 'active'
      and p.geom is not null
      and here.geom is not null
      and ST_DWithin(p.geom::geography, here.geom::geography, ${NEARBY_METERS})
    order by ST_Distance(p.geom::geography, here.geom::geography), p.id
    limit ${MOST_LISTED}
  `)
  const display = await displayIdsFor(
    db,
    result.rows.map((r) => r.id),
  )
  return result.rows.map((r) => ({
    parcelId: r.id,
    displayId: display.get(r.id) ?? null,
    siteAddress: r.site_address,
  }))
}
