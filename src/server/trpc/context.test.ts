import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('tRPC context', () => {
  it('wraps createContext in React.cache', () => {
    const source = readFileSync(new URL('./context.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/import \{[^}]*\bcache\b[^}]*\} from 'react'/)
    expect(source).toMatch(/export const createContext = cache\(/)
  })
})
