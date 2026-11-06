import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { envSchema } from '@/config/env'
import { GARAGE_IMAGE, MAILPIT_IMAGE, POSTGIS_IMAGE } from '@/constants/infra'
import { envExampleValues, serviceBlock } from './deploy/composeText'

const compose = readFileSync(new URL('./docker-compose.dev.yml', import.meta.url), 'utf8')
const images = [...compose.matchAll(/^\s+image:\s*(\S+)$/gm)].map((m) => m[1] ?? '')
const garage = serviceBlock(compose, 'garage')
const devExample = envExampleValues(
  readFileSync(new URL('./.env.example', import.meta.url), 'utf8'),
)
const defaults = envSchema.parse({
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BASE_URL: 'http://localhost:3000',
  CHIBAN_SECRET_KEYS: JSON.stringify({ k1: Buffer.alloc(32, 1).toString('base64') }),
  CHIBAN_ACTIVE_KEY_ID: 'k1',
})

describe('docker-compose.dev.yml', () => {
  it('uses no latest tag and no untagged image', () => {
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      expect(image, image).not.toMatch(/:latest(@|$)/)
      expect(image, image).toMatch(/[:@]/)
    }
  })

  it('pins mailpit and garage by digest', () => {
    expect(MAILPIT_IMAGE).toMatch(/^axllent\/mailpit@sha256:[0-9a-f]{64}$/)
    expect(GARAGE_IMAGE).toMatch(/^dxflrs\/garage:v[0-9.]+@sha256:[0-9a-f]{64}$/)
  })

  it('compose images match the shared infra constants', () => {
    expect(images).toEqual(expect.arrayContaining([POSTGIS_IMAGE, GARAGE_IMAGE, MAILPIT_IMAGE]))
    expect(compose).not.toMatch(/minio/i)
  })

  it('runs garage as a single node that creates the access key from its environment', () => {
    expect(garage).toContain(
      'command: ["/garage", "server", "--single-node", "--default-access-key"]',
    )
    expect(garage).toContain('./deploy/garage.toml:/etc/garage.toml:ro')
    expect(garage).toContain('chiban-garage:/var/lib/garage')
  })

  it('publishes the S3 API and the admin API on the ports the env defaults name', () => {
    expect(garage).toContain('"9010:3900"')
    expect(garage).toContain('"9011:3903"')
    expect(new URL(defaults.S3_ENDPOINT).port).toBe('9010')
    expect(new URL(defaults.GARAGE_ADMIN_ENDPOINT).port).toBe('9011')
  })

  it('gives garage the same access key, secret, and admin token the env defaults use', () => {
    expect(garage).toContain(`GARAGE_DEFAULT_ACCESS_KEY: ${defaults.S3_ACCESS_KEY_ID}`)
    expect(garage).toContain(`GARAGE_DEFAULT_SECRET_KEY: ${defaults.S3_SECRET_ACCESS_KEY}`)
    expect(garage).toContain(`GARAGE_ADMIN_TOKEN: ${defaults.GARAGE_ADMIN_TOKEN}`)
    expect(garage).toMatch(/GARAGE_RPC_SECRET: "[0-9a-f]{64}"$/m)
  })

  it('the dev env example uses the key garage creates and lists only the dev browser origin', () => {
    expect(garage).toContain(`GARAGE_DEFAULT_ACCESS_KEY: ${devExample.get('S3_ACCESS_KEY_ID')}`)
    expect(garage).toContain(`GARAGE_DEFAULT_SECRET_KEY: ${devExample.get('S3_SECRET_ACCESS_KEY')}`)
    expect(devExample.get('S3_CORS_ORIGINS')?.split(',')).toEqual(['http://localhost:3000'])
  })
})
