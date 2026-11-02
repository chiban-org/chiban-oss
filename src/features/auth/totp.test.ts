import { describe, expect, it } from 'vitest'
import { currentTotpCode, generateTotpSecret, totpUri, verifyTotp } from '@/features/auth/totp'

describe('totp', () => {
  const secret = generateTotpSecret()
  const now = Date.UTC(2026, 10, 1, 12, 0, 0)

  it('accepts the current code', () => {
    expect(verifyTotp(secret, currentTotpCode(secret, now), now)).toBe(true)
  })

  it('accepts one step either side', () => {
    expect(verifyTotp(secret, currentTotpCode(secret, now - 30_000), now)).toBe(true)
    expect(verifyTotp(secret, currentTotpCode(secret, now + 30_000), now)).toBe(true)
  })

  it('rejects two steps away', () => {
    expect(verifyTotp(secret, currentTotpCode(secret, now - 90_000), now)).toBe(false)
    expect(verifyTotp(secret, currentTotpCode(secret, now + 90_000), now)).toBe(false)
  })

  it('rejects junk', () => {
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false)
    expect(verifyTotp(secret, '', now)).toBe(false)
  })

  it('builds a 6 digit 30 second otpauth uri', () => {
    const uri = totpUri(secret, 'staff@alderpond.example')
    expect(uri.startsWith('otpauth://totp/')).toBe(true)
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
    expect(uri).toContain('issuer=Chiban')
  })
})
