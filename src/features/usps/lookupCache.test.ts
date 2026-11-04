import { describe, expect, it } from 'vitest'
import { createLookupCache } from '@/features/usps/lookupCache'

describe('lookup cache', () => {
  it('forgets an entry after its time is up', () => {
    const clock = { now: 0 }
    const cache = createLookupCache({ max: 5, ttlMs: 1_000, now: () => clock.now })
    cache.set('a', null)
    expect(cache.get('a')).toBeNull()
    clock.now = 1_001
    expect(cache.get('a')).toBeUndefined()
  })

  it('drops the oldest entry when full', () => {
    const cache = createLookupCache({ max: 2, ttlMs: 1_000, now: () => 0 })
    cache.set('a', null)
    cache.set('b', null)
    cache.set('c', null)
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeNull()
    expect(cache.get('c')).toBeNull()
  })
})
