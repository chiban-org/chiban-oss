import type { StandardAddress } from '@/features/usps/standardAddress'

export interface LookupCache {
  get(key: string): StandardAddress | null | undefined
  set(key: string, value: StandardAddress | null): void
}

interface Options {
  max: number
  ttlMs: number
  now: () => number
}

export function createLookupCache(options: Options): LookupCache {
  const entries = new Map<string, { value: StandardAddress | null; expiresAtMs: number }>()
  return {
    get(key) {
      const entry = entries.get(key)
      if (entry === undefined) return undefined
      if (options.now() > entry.expiresAtMs) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      entries.delete(key)
      entries.set(key, { value, expiresAtMs: options.now() + options.ttlMs })
      while (entries.size > options.max) {
        const oldest = entries.keys().next()
        if (oldest.done === true) break
        entries.delete(oldest.value)
      }
    },
  }
}
