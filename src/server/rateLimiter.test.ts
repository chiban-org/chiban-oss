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
})
