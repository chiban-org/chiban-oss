import { describe, expect, it } from 'vitest'
import { envSchema } from '@/config/env'
import { ENV_PREFIXES_STRICT } from '@/config/envStrict'
import { envExampleValues, readDeployFile, serviceBlock, serviceNames } from './composeText'

const compose = readDeployFile('docker-compose.yml')
const example = envExampleValues(readDeployFile('.env.example'))

const THIRD_PARTY_IMAGE_VARS = ['POSTGIS_IMAGE', 'MINIO_IMAGE', 'MC_IMAGE', 'CADDY_IMAGE']
const KEYS_OWNED_BY_HEALTH_WORK = ['HEALTH_DISK_PATHS']

function variableNames(text: string): string[] {
  return [...text.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((m) => m[1] ?? '')
}

describe('production compose', () => {
  it('defines exactly the expected services', () => {
    expect(serviceNames(compose).sort()).toEqual(
      ['app', 'caddy', 'createbucket', 'migrate', 'minio', 'postgres', 'worker'].sort(),
    )
  })

  it('every image is a variable and every env example image value has sha256', () => {
    const images = [...compose.matchAll(/^\s+image:\s*(\S+)$/gm)].map((m) => m[1] ?? '')
    const used = images.flatMap(variableNames).sort()
    expect(used).toEqual(
      [...THIRD_PARTY_IMAGE_VARS, 'CHIBAN_IMAGE', 'CHIBAN_IMAGE', 'CHIBAN_IMAGE'].sort(),
    )
    for (const image of images) expect(image, image).toMatch(/^\$\{[A-Z_]+\}$/)
    for (const variable of [...THIRD_PARTY_IMAGE_VARS, 'CHIBAN_IMAGE']) {
      expect(example.get(variable), variable).toMatch(/@sha256:[0-9a-f]{64}$/)
    }
  })

  it('app, worker, and migrate share CHIBAN_IMAGE and pass CHIBAN_IMAGE_REF', () => {
    for (const name of ['app', 'worker', 'migrate']) {
      const block = serviceBlock(compose, name)
      expect(block, name).toMatch(/image:\s*\$\{CHIBAN_IMAGE\}/)
      expect(block, name).toMatch(/CHIBAN_IMAGE_REF:\s*\$\{CHIBAN_IMAGE\}/)
    }
  })

  it('postgres and minio publish no ports', () => {
    for (const name of ['postgres', 'minio', 'createbucket', 'app', 'worker', 'migrate']) {
      expect(serviceBlock(compose, name), name).not.toMatch(/^\s+ports:/m)
    }
    expect(serviceBlock(compose, 'caddy')).toContain('"80:80"')
    expect(serviceBlock(compose, 'caddy')).toContain('"443:443"')
  })

  it('worker mounts both data volumes read-only for disk checks', () => {
    const worker = serviceBlock(compose, 'worker')
    expect(worker).toContain('pgdata:/monitor/pg:ro')
    expect(worker).toContain('miniodata:/monitor/minio:ro')
    expect(worker).toMatch(/HEALTH_DISK_PATHS:\s*\/monitor\/pg,\/monitor\/minio/)
  })

  it('worker runs the bundled worker entrypoint', () => {
    expect(serviceBlock(compose, 'worker')).toContain('command: ["node", "dist/worker.mjs"]')
  })

  it('migrate is a one-shot that runs the bundled migrator', () => {
    const migrate = serviceBlock(compose, 'migrate')
    expect(migrate).toContain('command: ["node", "dist/migrate.mjs"]')
    expect(migrate).toContain('restart: "no"')
  })

  it('app waits for migrate to complete successfully', () => {
    expect(serviceBlock(compose, 'app')).toMatch(
      /migrate:\n\s+condition: service_completed_successfully/,
    )
  })

  it('minio allows CORS from BASE_URL', () => {
    expect(serviceBlock(compose, 'minio')).toContain('MINIO_API_CORS_ALLOW_ORIGIN: ${BASE_URL}')
  })

  it('createbucket is a one-shot that creates the bucket without a shell', () => {
    const block = serviceBlock(compose, 'createbucket')
    expect(block).toContain('image: ${MC_IMAGE}')
    expect(block).toContain('restart: on-failure')
    expect(block).toContain('mb')
    expect(block).toContain('--ignore-existing')
  })

  it('declares both data volumes', () => {
    expect(compose).toMatch(/^volumes:\n/m)
    expect(compose).toMatch(/^ {2}pgdata:/m)
    expect(compose).toMatch(/^ {2}miniodata:/m)
  })

  it('passes the optional USPS credentials to every app container, blank when unset', () => {
    const anchor = compose.slice(0, compose.indexOf('\nservices:'))
    expect(anchor).toContain('USPS_CLIENT_ID: ${USPS_CLIENT_ID:-}')
    expect(anchor).toContain('USPS_CLIENT_SECRET: ${USPS_CLIENT_SECRET:-}')
    expect(example.get('USPS_CLIENT_ID')).toBe('')
    expect(example.get('USPS_CLIENT_SECRET')).toBe('')
  })

  it('every variable has a value in the env example', () => {
    const missing = [...new Set(variableNames(compose))].filter((v) => !example.has(v))
    expect(missing).toEqual([])
  })

  it('passes only settings the app schema declares under its strict prefixes', () => {
    const declared = new Set([...Object.keys(envSchema.shape), ...KEYS_OWNED_BY_HEALTH_WORK])
    const keys = [...compose.matchAll(/^\s+([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1] ?? '')
    const strict = keys.filter((k) => ENV_PREFIXES_STRICT.some((p) => k.startsWith(p)))
    expect(strict.length).toBeGreaterThan(0)
    expect(strict.filter((k) => !declared.has(k))).toEqual([])
  })
})
