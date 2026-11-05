import type { PickedParcel } from '@/features/parcels/parcelPick'
import { trpcClient } from '@/lib/trpc-client'

export function staffParcelSearch(q: string, signal: AbortSignal): Promise<PickedParcel[]> {
  return trpcClient.parcels.pick.query({ q }, { signal })
}
