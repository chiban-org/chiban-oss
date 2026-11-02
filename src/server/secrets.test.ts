import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { decryptSecret, encryptSecret, needsReencrypt } from '@/server/secrets'

const key = () => randomBytes(32).toString('base64')
const original = { keys: env.CHIBAN_SECRET_KEYS, active: env.CHIBAN_ACTIVE_KEY_ID }

function configure(keys: Record<string, string>, active: string): void {
  env.CHIBAN_SECRET_KEYS = keys
  env.CHIBAN_ACTIVE_KEY_ID = active
}

beforeEach(() => {
  configure({ k1: key() }, 'k1')
})
afterEach(() => {
  configure(original.keys, original.active)
})

describe('secrets', () => {
  it('round trips a plaintext', () => {
    const blob = encryptSecret('smtp-password')
    expect(blob.startsWith('v1:k1:')).toBe(true)
    expect(decryptSecret(blob)).toEqual({ ok: true, value: 'smtp-password' })
  })

  it('still decrypts a k1 blob after k2 becomes active, and asks for re-encryption', () => {
    const k1 = env.CHIBAN_SECRET_KEYS.k1 ?? ''
    const blob = encryptSecret('hello')
    configure({ k1, k2: key() }, 'k2')
    expect(decryptSecret(blob)).toEqual({ ok: true, value: 'hello' })
    expect(needsReencrypt(blob)).toBe(true)
    expect(needsReencrypt(encryptSecret('hello'))).toBe(false)
  })

  it('returns unknown_key once the old key is removed', () => {
    const blob = encryptSecret('hello')
    configure({ k2: key() }, 'k2')
    expect(decryptSecret(blob)).toEqual({ ok: false, error: 'unknown_key' })
  })

  it('returns tampered when a ciphertext byte is flipped', () => {
    const parts = encryptSecret('hello world').split(':')
    const cipher = Buffer.from(parts[4] ?? '', 'base64url')
    cipher[0] = (cipher[0] ?? 0) ^ 0xff
    parts[4] = cipher.toString('base64url')
    expect(decryptSecret(parts.join(':'))).toEqual({ ok: false, error: 'tampered' })
  })

  it('returns malformed for junk', () => {
    expect(decryptSecret('nonsense')).toEqual({ ok: false, error: 'malformed' })
    expect(decryptSecret('v2:k1:a:b:c')).toEqual({ ok: false, error: 'malformed' })
  })

  it('produces a distinct blob each time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })
})
