import { describe, expect, it } from 'vitest'
import { corsOriginsFor } from '@/features/storage/corsOrigins'

describe('corsOriginsFor', () => {
  it('falls back to the origin of BASE_URL when no list is set', () => {
    expect(corsOriginsFor({ BASE_URL: 'https://town.example.org/', S3_CORS_ORIGINS: [] })).toEqual([
      'https://town.example.org',
    ])
  })

  it('uses the listed origins and strips paths and trailing slashes', () => {
    expect(
      corsOriginsFor({
        BASE_URL: 'http://localhost:3000',
        S3_CORS_ORIGINS: ['http://localhost:3000/', 'http://localhost:3100/app'],
      }),
    ).toEqual(['http://localhost:3000', 'http://localhost:3100'])
  })
})
