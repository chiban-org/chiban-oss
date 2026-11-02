import { describe, expect, it } from 'vitest'
import { mintCsrfToken, validateCsrf } from '@/features/auth/csrf'

const base = {
  cookieToken: 'abc',
  headerToken: 'abc',
  origin: 'https://alderpond.example',
  host: 'alderpond.example',
  secFetchSite: 'same-origin',
}

describe('validateCsrf', () => {
  it('accepts a matching double submit from the app origin', () => {
    expect(validateCsrf(base)).toEqual({ ok: true, value: true })
  })

  it('rejects a missing token', () => {
    expect(validateCsrf({ ...base, headerToken: null }).ok).toBe(false)
    expect(validateCsrf({ ...base, cookieToken: null }).ok).toBe(false)
  })

  it('rejects a mismatched token', () => {
    expect(validateCsrf({ ...base, headerToken: 'abd' }).ok).toBe(false)
    expect(validateCsrf({ ...base, headerToken: 'abcd' }).ok).toBe(false)
  })

  it('rejects a foreign origin', () => {
    expect(validateCsrf({ ...base, origin: 'https://evil.example' }).ok).toBe(false)
  })

  it('rejects a cross-site fetch', () => {
    expect(validateCsrf({ ...base, secFetchSite: 'cross-site' }).ok).toBe(false)
  })

  it('mints distinct url-safe tokens', () => {
    const a = mintCsrfToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mintCsrfToken()).not.toBe(a)
  })
})
