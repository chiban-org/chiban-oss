import type { SearchResult } from '@/features/search/searchTypes'
import { trpcClient } from '@/lib/trpc-client'

export type FindRecords = (q: string, signal: AbortSignal) => Promise<SearchResult>

export const findRecords: FindRecords = (q, signal) =>
  trpcClient.search.find.query({ q }, { signal })
