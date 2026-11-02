import { describe, expect, it } from 'vitest'
import { clientKey } from '@/features/anonymousIntake/clientKey'

describe('clientKey', () => {
  it('is a salted digest that does not contain the address', () => {
    const key = clientKey('198.51.100.7')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('198')
  })

  it('uses the rightmost forwarded entry, the one the proxy appended', () => {
    expect(clientKey('203.0.113.50, 198.51.100.7')).toBe(clientKey('198.51.100.7'))
    expect(clientKey('198.51.100.7')).not.toBe(clientKey('198.51.100.8'))
  })

  it('is unknown without a forwarded address', () => {
    expect(clientKey(null)).toBe('unknown')
    expect(clientKey('')).toBe('unknown')
    expect(clientKey('  ,  ')).toBe('unknown')
  })
})
