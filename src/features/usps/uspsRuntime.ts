import { env } from '@/config/env'
import { createAddressSuggester } from '@/features/usps/addressSuggester'
import { chooseLookup } from '@/features/usps/chooseLookup'
import { createLookupCache } from '@/features/usps/lookupCache'
import { createRateLimiter } from '@/server/rateLimiter'

const LOOKUP_TIMEOUT_MS = 2_000
const LOOKUPS_PER_PERSON_PER_MINUTE = 30
const CACHED_ADDRESSES = 2_000
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const addressSuggester = createAddressSuggester({
  lookup: chooseLookup(env, { fetch: (input, init) => fetch(input, init), now: Date.now }),
  cache: createLookupCache({ max: CACHED_ADDRESSES, ttlMs: CACHE_TTL_MS, now: Date.now }),
  limiter: createRateLimiter({ max: LOOKUPS_PER_PERSON_PER_MINUTE, windowMs: 60_000 }),
  timeoutMs: LOOKUP_TIMEOUT_MS,
})
