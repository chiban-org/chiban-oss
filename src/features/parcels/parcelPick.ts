import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { parcels } from '@/db/schema'
import { displayIdsFor } from '@/features/parcels/displayId'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { type ParcelSearchHit, searchParcels } from '@/features/parcels/searchParcels'

export type PickedParcel = Pick<
  ParcelSearchHit,
  'parcelId' | 'displayId' | 'status' | 'siteAddress' | 'ownerName'
>

export const PICK_LIMIT = 8

function toPicked(hit: ParcelSearchHit): PickedParcel {
  return {
    parcelId: hit.parcelId,
    displayId: hit.displayId,
    status: hit.status,
    siteAddress: hit.siteAddress,
    ownerName: hit.ownerName,
  }
}

export async function pickParcels(
  db: DbOrTx,
  q: string,
  signal: AbortSignal,
): Promise<PickedParcel[]> {
  const hits = await searchParcels(db, { q, limit: PICK_LIMIT }, signal)
  return hits.map(toPicked)
}

export async function pickedParcelFor(
  db: DbOrTx,
  ref: string,
  signal: AbortSignal,
): Promise<PickedParcel | null> {
  const found = await resolveParcelId(db, { value: ref }, signal)
  if (!found.ok) return null
  const { parcelId } = found.value
  const [[row], display] = await Promise.all([
    db
      .select({
        status: parcels.status,
        siteAddress: parcels.siteAddress,
        ownerName: parcels.ownerName,
      })
      .from(parcels)
      .where(eq(parcels.id, parcelId)),
    displayIdsFor(db, [parcelId]),
  ])
  if (row === undefined) return null
  return { parcelId, displayId: display.get(parcelId) ?? null, ...row }
}
