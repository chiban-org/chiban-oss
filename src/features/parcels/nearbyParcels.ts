import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { parcels } from '@/db/schema'
import { adjacentParcels } from '@/features/abutters/adjacency'
import { displayIdsFor } from '@/features/parcels/displayId'

const TOUCHING_FT = 5
const MOST_LISTED = 12

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
  const ids = await adjacentParcels(db, [parcelId], TOUCHING_FT, signal)
  if (ids.length === 0) return []
  const rows = await db
    .select({ parcelId: parcels.id, siteAddress: parcels.siteAddress })
    .from(parcels)
    .where(inArray(parcels.id, ids))
  const display = await displayIdsFor(db, ids)
  return rows
    .map((r) => ({ ...r, displayId: display.get(r.parcelId) ?? null }))
    .sort((a, b) =>
      (a.siteAddress ?? a.displayId ?? '').localeCompare(b.siteAddress ?? b.displayId ?? ''),
    )
    .slice(0, MOST_LISTED)
}
