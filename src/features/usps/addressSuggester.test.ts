import { describe, expect, it } from 'vitest'
import { createAddressSuggester } from '@/features/usps/addressSuggester'
import { createLookupCache } from '@/features/usps/lookupCache'
import type { StandardAddress } from '@/features/usps/standardAddress'
import type { LookupOutcome, UspsLookup } from '@/features/usps/uspsClient'
import { createRateLimiter } from '@/server/rateLimiter'

const STANDARD: StandardAddress = {
  streetAddress: '1 MAIN ST',
  city: 'ALDER POND',
  state: 'NH',
  ZIPCode: '03000',
  ZIPPlus4: '1234',
}
const TYPED = ['1 Main Street, Alder Pond NH']

function countingLookup(answer: () => Promise<LookupOutcome>) {
  const seen: unknown[] = []
  const lookup: UspsLookup = {
    standardize(query) {
      seen.push(query)
      return answer()
    },
  }
  return { lookup, seen }
}

function suggesterWith(
  lookup: UspsLookup | null,
  overrides: { max?: number; timeoutMs?: number } = {},
) {
  return createAddressSuggester({
    lookup,
    cache: createLookupCache({ max: 10, ttlMs: 60_000, now: () => 0 }),
    limiter: createRateLimiter({ max: overrides.max ?? 5, windowMs: 60_000, now: () => 0 }),
    timeoutMs: overrides.timeoutMs ?? 2_000,
  })
}

const signal = () => new AbortController().signal
const found = () => Promise.resolve<LookupOutcome>({ ok: true, value: STANDARD })

describe('address suggester', () => {
  it('returns nothing when USPS is not configured', async () => {
    expect(await suggesterWith(null).suggest(TYPED, 'user-1', signal())).toBeNull()
  })

  it('returns nothing and asks USPS nothing for text that is not an address', async () => {
    const usps = countingLookup(found)
    expect(
      await suggesterWith(usps.lookup).suggest(['call the clerk'], 'user-1', signal()),
    ).toBeNull()
    expect(usps.seen).toEqual([])
  })

  it('suggests the USPS address and says when it differs from what was typed', async () => {
    const usps = countingLookup(found)
    expect(await suggesterWith(usps.lookup).suggest(TYPED, 'user-1', signal())).toEqual({
      lines: ['1 MAIN ST', 'ALDER POND NH 03000-1234'],
      matches: false,
    })
  })

  it('says when the typed address already matches', async () => {
    const usps = countingLookup(found)
    const typed = ['1 Main St', 'Alder Pond NH 03000-1234']
    expect((await suggesterWith(usps.lookup).suggest(typed, 'user-1', signal()))?.matches).toBe(
      true,
    )
  })

  it('returns nothing when USPS is slower than the timeout', async () => {
    const usps = countingLookup(() => new Promise<LookupOutcome>(() => undefined))
    const started = Date.now()
    const result = await suggesterWith(usps.lookup, { timeoutMs: 20 }).suggest(TYPED, 'u', signal())
    expect(result).toBeNull()
    expect(Date.now() - started).toBeLessThan(1_000)
  })

  it('returns nothing when USPS fails or throws, and asks again next time', async () => {
    const failing = countingLookup(() =>
      Promise.resolve<LookupOutcome>({ ok: false, error: 'unreachable' }),
    )
    const suggester = suggesterWith(failing.lookup)
    expect(await suggester.suggest(TYPED, 'user-1', signal())).toBeNull()
    expect(await suggester.suggest(TYPED, 'user-1', signal())).toBeNull()
    expect(failing.seen).toHaveLength(2)
    const throwing = countingLookup(() => Promise.reject(new Error('socket hang up')))
    expect(await suggesterWith(throwing.lookup).suggest(TYPED, 'user-1', signal())).toBeNull()
  })

  it('answers the same address typed differently from the cache', async () => {
    const usps = countingLookup(found)
    const suggester = suggesterWith(usps.lookup)
    await suggester.suggest(TYPED, 'user-1', signal())
    const again = await suggester.suggest(['1 MAIN STREET,  alder pond, nh'], 'user-2', signal())
    expect(again?.lines).toEqual(['1 MAIN ST', 'ALDER POND NH 03000-1234'])
    expect(usps.seen).toHaveLength(1)
  })

  it('remembers that USPS found no match', async () => {
    const usps = countingLookup(() => Promise.resolve<LookupOutcome>({ ok: true, value: null }))
    const suggester = suggesterWith(usps.lookup)
    expect(await suggester.suggest(TYPED, 'user-1', signal())).toBeNull()
    expect(await suggester.suggest(TYPED, 'user-1', signal())).toBeNull()
    expect(usps.seen).toHaveLength(1)
  })

  it('stops asking USPS for one person past the limit, without affecting others', async () => {
    const usps = countingLookup(found)
    const suggester = suggesterWith(usps.lookup, { max: 2 })
    const typed = (n: number) => [`${String(n)} Main Street, Alder Pond NH`]
    expect(await suggester.suggest(typed(1), 'user-1', signal())).not.toBeNull()
    expect(await suggester.suggest(typed(2), 'user-1', signal())).not.toBeNull()
    expect(await suggester.suggest(typed(3), 'user-1', signal())).toBeNull()
    expect(usps.seen).toHaveLength(2)
    expect(await suggester.suggest(typed(1), 'user-1', signal())).not.toBeNull()
    expect(await suggester.suggest(typed(3), 'user-2', signal())).not.toBeNull()
    expect(usps.seen).toHaveLength(3)
  })
})
