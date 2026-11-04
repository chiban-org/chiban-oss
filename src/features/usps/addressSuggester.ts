import type { AddressSuggestion } from '@/features/address/suggestionLayout'
import { parseTypedAddress, type UspsQuery } from '@/features/usps/addressQuery'
import type { LookupCache } from '@/features/usps/lookupCache'
import { buildSuggestion } from '@/features/usps/standardAddress'
import type { LookupOutcome, UspsLookup } from '@/features/usps/uspsClient'
import type { RateLimiter } from '@/server/rateLimiter'

export interface SuggesterDeps {
  lookup: UspsLookup | null
  cache: LookupCache
  limiter: RateLimiter
  timeoutMs: number
}

export interface AddressSuggester {
  suggest(
    lines: readonly string[],
    userKey: string,
    signal: AbortSignal,
  ): Promise<AddressSuggestion | null>
}

const GAVE_UP: LookupOutcome = { ok: false, error: 'unreachable' }

function cacheKey(query: UspsQuery): string {
  return [query.streetAddress, query.secondaryAddress, query.city, query.state, query.ZIPCode]
    .map((part) =>
      (part ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim(),
    )
    .join('|')
}

function untilAborted(signal: AbortSignal): Promise<LookupOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve(GAVE_UP)
    signal.addEventListener('abort', () => resolve(GAVE_UP), { once: true })
  })
}

async function askWithDeadline(
  lookup: UspsLookup,
  query: UspsQuery,
  signal: AbortSignal,
): Promise<LookupOutcome> {
  try {
    return await Promise.race([lookup.standardize(query, signal), untilAborted(signal)])
  } catch {
    return GAVE_UP
  }
}

export function createAddressSuggester(deps: SuggesterDeps): AddressSuggester {
  return {
    async suggest(lines, userKey, signal) {
      const lookup = deps.lookup
      const typed = parseTypedAddress(lines)
      if (lookup === null || typed === null) return null
      const key = cacheKey(typed.query)
      const cached = deps.cache.get(key)
      if (cached !== undefined) return cached === null ? null : buildSuggestion(typed, cached)
      if (deps.limiter.isLimited(userKey)) return null
      deps.limiter.recordFailure(userKey)
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(deps.timeoutMs)])
      const outcome = await askWithDeadline(lookup, typed.query, deadline)
      if (!outcome.ok) return null
      deps.cache.set(key, outcome.value)
      return outcome.value === null ? null : buildSuggestion(typed, outcome.value)
    },
  }
}
