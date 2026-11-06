import { describe, expect, it } from 'vitest'
import { envSchema } from '@/config/env'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BASE_URL: 'https://alderpond.example',
  CHIBAN_SECRET_KEYS: JSON.stringify({ k1: Buffer.alloc(32, 1).toString('base64') }),
  CHIBAN_ACTIVE_KEY_ID: 'k1',
}

const GARAGE_MIN_KEY_ID_LENGTH = 8

describe('object storage environment', () => {
  it('defaults the access key id to one Garage accepts as an imported key', () => {
    const parsed = envSchema.parse(base)
    expect(parsed.S3_ACCESS_KEY_ID.length).toBeGreaterThanOrEqual(GARAGE_MIN_KEY_ID_LENGTH)
  })

  it('defaults the Garage admin API to the dev compose port', () => {
    const parsed = envSchema.parse(base)
    expect(parsed.GARAGE_ADMIN_ENDPOINT).toBe('http://localhost:9011')
    expect(parsed.GARAGE_ADMIN_TOKEN.length).toBeGreaterThan(0)
  })

  it('parses S3_CORS_ORIGINS as a list of urls and defaults to none', () => {
    expect(envSchema.parse(base).S3_CORS_ORIGINS).toEqual([])
    const parsed = envSchema.parse({
      ...base,
      S3_CORS_ORIGINS: 'http://localhost:3000, http://localhost:3100',
    })
    expect(parsed.S3_CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:3100'])
    expect(envSchema.safeParse({ ...base, S3_CORS_ORIGINS: 'not a url' }).success).toBe(false)
  })
})
