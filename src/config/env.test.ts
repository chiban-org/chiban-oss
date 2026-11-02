import { describe, expect, it } from 'vitest'
import { envSchema } from '@/config/env'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BASE_URL: 'https://alderpond.example',
  CHIBAN_SECRET_KEYS: JSON.stringify({ k1: Buffer.alloc(32, 1).toString('base64') }),
  CHIBAN_ACTIVE_KEY_ID: 'k1',
}

describe('payment environment', () => {
  it('STRIPE_API_BASE in production fails env parsing', () => {
    const parsed = envSchema.safeParse({
      ...base,
      NODE_ENV: 'production',
      STRIPE_API_BASE: 'http://localhost:12111',
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toContain('STRIPE_API_BASE')
  })

  it('STRIPE_API_BASE is accepted in development', () => {
    const parsed = envSchema.safeParse({
      ...base,
      NODE_ENV: 'development',
      STRIPE_API_BASE: 'http://localhost:12111',
    })
    expect(parsed.success).toBe(true)
  })

  it('ENABLE_SIMULATED_PAYMENTS defaults to false', () => {
    const parsed = envSchema.safeParse(base)
    expect(parsed.success && parsed.data.ENABLE_SIMULATED_PAYMENTS).toBe(false)
  })
})

describe('alert environment', () => {
  it('parses comma lists and defaults the disk path to the root', () => {
    const parsed = envSchema.safeParse({
      ...base,
      ALERT_EMAIL_TO: 'a@alderpond.example, b@alderpond.example',
    })
    expect(parsed.success && parsed.data.ALERT_EMAIL_TO).toEqual([
      'a@alderpond.example',
      'b@alderpond.example',
    ])
    expect(parsed.success && parsed.data.HEALTH_DISK_PATHS).toEqual(['/'])
    expect(envSchema.safeParse(base).data?.ALERT_EMAIL_TO).toEqual([])
  })

  it('rejects an address that is not an email', () => {
    expect(envSchema.safeParse({ ...base, ALERT_EMAIL_TO: 'not-an-address' }).success).toBe(false)
  })

  it('PAGER_EVENTS_URL without PAGER_ROUTING_KEY fails env parsing', () => {
    const parsed = envSchema.safeParse({
      ...base,
      PAGER_EVENTS_URL: 'http://localhost:9/v2/enqueue',
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toContain('PAGER_ROUTING_KEY')
  })
})
