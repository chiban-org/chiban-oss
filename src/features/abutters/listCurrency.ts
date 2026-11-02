import type { DbOrTx } from '@/db/client'
import { applicantParcelIds, sameParcels } from '@/features/abutters/applicantParcels'
import type { IssuedList } from '@/features/abutters/queries'

export async function drawnForCurrentParcels(
  db: DbOrTx,
  list: IssuedList,
  signal: AbortSignal,
): Promise<boolean> {
  const drawnFor = list.snapshot.applicantParcelIds
  if (drawnFor === undefined) return true
  return sameParcels(drawnFor, await applicantParcelIds(db, list.applicationId, signal))
}
