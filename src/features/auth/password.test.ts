import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/features/auth/password'

const signal = new AbortController().signal

describe('password hashing', () => {
  it('stores scrypt with N=2^15 r=8 p=1 and a random salt', async () => {
    const a = await hashPassword('correct horse', signal)
    const b = await hashPassword('correct horse', signal)
    const parts = a.split('$')
    expect(parts.slice(0, 4)).toEqual(['scrypt', '32768', '8', '1'])
    expect(parts).toHaveLength(6)
    expect(a).not.toBe(b)
  })

  it('verifies the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct horse', signal)
    expect(await verifyPassword('correct horse', stored, signal)).toBe(true)
    expect(await verifyPassword('wrong horse', stored, signal)).toBe(false)
  })

  it('rejects a malformed stored value', async () => {
    expect(await verifyPassword('x', 'garbage', signal)).toBe(false)
    expect(await verifyPassword('x', 'scrypt$1$2$3$4', signal)).toBe(false)
  })
})
