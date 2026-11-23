import { describe, expect, it } from 'vitest'
import { clientKey } from '@/features/anonymousIntake/clientKey'
import { distinctClientHeaders } from './clientAddress'

describe('distinct e2e client addresses', () => {
  it('gives each browser context its own rate limit client', () => {
    const first = distinctClientHeaders()['X-Forwarded-For'] ?? null
    const second = distinctClientHeaders()['X-Forwarded-For'] ?? null
    expect(clientKey(first)).not.toBe(clientKey(second))
    expect(clientKey(first)).not.toBe(clientKey(null))
  })

  it('sends one address, so the server keys on it rather than a proxy hop', () => {
    expect(distinctClientHeaders()['X-Forwarded-For']).toMatch(/^2001:db8::[0-9a-f:]+$/)
  })
})
