import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '@/server/rateLimiter'

describe('rate limiter', () => {
  it('blocks after max failures in the window', () => {
    const t = 0
    const limiter = createRateLimiter({ max: 3, windowMs: 1000, now: () => t })
    for (let i = 0; i < 3; i += 1) limiter.recordFailure('a')
    expect(limiter.isLimited('a')).toBe(true)
    expect(limiter.isLimited('b')).toBe(false)
  })

  it('forgets failures older than the window', () => {
    let t = 0
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => t })
    limiter.recordFailure('a')
    limiter.recordFailure('a')
    t = 1001
    expect(limiter.isLimited('a')).toBe(false)
  })

  it('clears on reset for a key', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 })
    limiter.recordFailure('a')
    limiter.clear('a')
    expect(limiter.isLimited('a')).toBe(false)
  })

  it('limiter holds no key after its window', () => {
    let t = 0
    const limiter = createRateLimiter({ max: 5, windowMs: 1000, now: () => t })
    limiter.recordFailure('a')
    limiter.recordFailure('b')
    expect(limiter.size()).toBe(2)
    t = 1001
    limiter.prune()
    expect(limiter.size()).toBe(0)
  })

  it('prune keeps keys that are still inside the window', () => {
    let t = 0
    const limiter = createRateLimiter({ max: 5, windowMs: 1000, now: () => t })
    limiter.recordFailure('old')
    t = 600
    limiter.recordFailure('new')
    t = 1200
    limiter.prune()
    expect(limiter.size()).toBe(1)
    expect(limiter.isLimited('new')).toBe(false)
  })

  it('forgives the most recent attempt for a key', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => 0 })
    limiter.recordFailure('k')
    limiter.recordFailure('k')
    expect(limiter.isLimited('k')).toBe(true)
    limiter.forgiveOne('k')
    expect(limiter.isLimited('k')).toBe(false)
    limiter.forgiveOne('k')
    limiter.forgiveOne('k')
    expect(limiter.size()).toBe(0)
  })
})
