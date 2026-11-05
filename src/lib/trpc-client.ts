import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import superjson from 'superjson'
import type { AppRouter } from '@/server/trpc/root'

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
})

export type RouterOutputs = inferRouterOutputs<AppRouter>
