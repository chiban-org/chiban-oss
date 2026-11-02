export interface RateLimiter {
  recordFailure(key: string): void
  isLimited(key: string): boolean
  clear(key: string): void
  reset(): void
}

interface Options {
  max: number
  windowMs: number
  now?: () => number
}

export function createRateLimiter(options: Options): RateLimiter {
  const now = options.now ?? Date.now
  const failures = new Map<string, number[]>()

  function recent(key: string): number[] {
    const cutoff = now() - options.windowMs
    const kept = (failures.get(key) ?? []).filter((t) => t > cutoff)
    if (kept.length === 0) failures.delete(key)
    else failures.set(key, kept)
    return kept
  }

  return {
    recordFailure(key) {
      failures.set(key, [...recent(key), now()])
    },
    isLimited(key) {
      return recent(key).length >= options.max
    },
    clear(key) {
      failures.delete(key)
    },
    reset() {
      failures.clear()
    },
  }
}
