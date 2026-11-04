import { createTRPCClient, httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import type { PickedParcel } from '@/features/parcels/parcelPick'
import type { AppRouter } from '@/server/trpc/root'

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
})

export function staffParcelSearch(q: string, signal: AbortSignal): Promise<PickedParcel[]> {
  return client.parcels.pick.query({ q }, { signal })
}
