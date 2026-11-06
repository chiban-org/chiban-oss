import type { DbOrTx } from '@/db/client'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { refuseField } from '@/server/formInput'

export async function parcelFor(
  db: DbOrTx,
  parcelRef: string,
  signal: AbortSignal,
): Promise<{ parcelId: string } | ReturnType<typeof refuseField>> {
  const found = await resolveParcelId(db, { value: parcelRef }, signal)
  return found.ok
    ? { parcelId: found.value.parcelId }
    : refuseField(
        'parcelRef',
        `No parcel has the ID ${parcelRef}. Check the parcel ID and try again.`,
      )
}
