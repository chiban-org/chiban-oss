import { describe, expect, it } from 'vitest'
import { envSchema } from '@/config/env'
import { ENV_PREFIXES_STRICT } from '@/config/envStrict'
import { envExampleValues, readDeployFile, serviceBlock, serviceNames } from './composeText'

const compose = readDeployFile('docker-compose.yml')
const example = envExampleValues(readDeployFile('.env.example'))

const THIRD_PARTY_IMAGE_VARS = ['POSTGIS_IMAGE', 'GARAGE_IMAGE', 'CADDY_IMAGE']
const CHIBAN_IMAGE_SERVICES = ['app', 'worker', 'migrate', 'storageinit']
const KEYS_OWNED_BY_HEALTH_WORK = ['HEALTH_DISK_PATHS']
const HOST_TUNABLE_SETTINGS = [
  'LOG_LEVEL',
  'ALERT_EMAIL_TO',
  'HEALTH_HEARTBEAT_URL',
  'PAGER_EVENTS_URL',
  'PAGER_ROUTING_KEY',
  'S3_REGION',
  'S3_CORS_ORIGINS',
  'MAX_UPLOAD_BYTES',
  'ENABLE_SIMULATED_PAYMENTS',
  'STRIPE_API_BASE',
  'CHIBAN_DEMO_MODE',
  'CHIBAN_DEMO_RESET_AT',
  'CHIBAN_DEMO_MAIL_SINK_HOSTS',
  'CHIBAN_DEMO_OVERLAY_FILE',
  'BACKUP_PASSPHRASE',
] as const
const VALID_REQUIRED = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BASE_URL: 'https://town.example.org',
  CHIBAN_SECRET_KEYS: JSON.stringify({ k1: Buffer.alloc(32, 1).toString('base64') }),
  CHIBAN_ACTIVE_KEY_ID: 'k1',
}

function variableNames(text: string): string[] {
  return [...text.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((m) => m[1] ?? '')
}

describe('production compose', () => {
  it('defines exactly the expected services', () => {
    expect(serviceNames(compose).sort()).toEqual(
      ['app', 'caddy', 'garage', 'migrate', 'postgres', 'storageinit', 'worker'].sort(),
    )
  })

  it('every image is a variable and every env example image value has sha256', () => {
    const images = [...compose.matchAll(/^\s+image:\s*(\S+)$/gm)].map((m) => m[1] ?? '')
    const used = images.flatMap(variableNames).sort()
    expect(used).toEqual(
      [...THIRD_PARTY_IMAGE_VARS, ...CHIBAN_IMAGE_SERVICES.map(() => 'CHIBAN_IMAGE')].sort(),
    )
    for (const image of images) expect(image, image).toMatch(/^\$\{[A-Z_]+\}$/)
    for (const variable of [...THIRD_PARTY_IMAGE_VARS, 'CHIBAN_IMAGE']) {
      expect(example.get(variable), variable).toMatch(/@sha256:[0-9a-f]{64}$/)
    }
  })

  it('app, worker, migrate, and storageinit share CHIBAN_IMAGE and pass CHIBAN_IMAGE_REF', () => {
    for (const name of CHIBAN_IMAGE_SERVICES) {
      const block = serviceBlock(compose, name)
      expect(block, name).toMatch(/image:\s*\$\{CHIBAN_IMAGE\}/)
      expect(block, name).toMatch(/CHIBAN_IMAGE_REF:\s*\$\{CHIBAN_IMAGE\}/)
    }
  })

  it('postgres and garage publish no ports', () => {
    for (const name of ['postgres', 'garage', 'storageinit', 'app', 'worker', 'migrate']) {
      expect(serviceBlock(compose, name), name).not.toMatch(/^\s+ports:/m)
    }
    expect(serviceBlock(compose, 'caddy')).toContain('"80:80"')
    expect(serviceBlock(compose, 'caddy')).toContain('"443:443"')
  })

  it('worker mounts both data volumes read-only for disk checks', () => {
    const worker = serviceBlock(compose, 'worker')
    expect(worker).toContain('pgdata:/monitor/pg:ro')
    expect(worker).toContain('garagedata:/monitor/garage:ro')
    expect(worker).toMatch(/HEALTH_DISK_PATHS:\s*\/monitor\/pg,\/monitor\/garage/)
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

  it('garage runs as a single node with the app access key and keeps its data on a volume', () => {
    const block = serviceBlock(compose, 'garage')
    expect(block).toContain(
      'command: ["/garage", "server", "--single-node", "--default-access-key"]',
    )
    expect(block).toContain('GARAGE_DEFAULT_ACCESS_KEY: ${S3_ACCESS_KEY_ID}')
    expect(block).toContain('GARAGE_DEFAULT_SECRET_KEY: ${S3_SECRET_ACCESS_KEY}')
    expect(block).toContain('GARAGE_RPC_SECRET: ${GARAGE_RPC_SECRET}')
    expect(block).toContain('GARAGE_ADMIN_TOKEN: ${GARAGE_ADMIN_TOKEN}')
    expect(block).toContain('./garage.toml:/etc/garage.toml:ro')
    expect(block).toContain('garagedata:/var/lib/garage')
    expect(block).toContain('test: ["CMD", "/garage", "health"]')
  })

  it('the app reaches garage on its S3 port with the shared access key', () => {
    const anchor = compose.slice(0, compose.indexOf('\nservices:'))
    expect(anchor).toContain('S3_ENDPOINT: http://garage:3900')
    expect(anchor).toContain('S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}')
    expect(anchor).toContain('S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}')
    expect(anchor).not.toContain('GARAGE_ADMIN_TOKEN')
  })

  it('storageinit prepares the bucket through the admin API once garage is healthy', () => {
    const block = serviceBlock(compose, 'storageinit')
    expect(block).toContain('command: ["node", "dist/storage-init.mjs"]')
    expect(block).toContain('restart: "no"')
    expect(block).toContain('GARAGE_ADMIN_ENDPOINT: http://garage:3903')
    expect(block).toContain('GARAGE_ADMIN_TOKEN: ${GARAGE_ADMIN_TOKEN}')
    expect(block).toMatch(/garage:\n\s+condition: service_healthy/)
    expect(serviceBlock(compose, 'migrate')).toMatch(
      /storageinit:\n\s+condition: service_completed_successfully/,
    )
  })

  it('the env example sizes the Garage secrets and key id the way Garage requires', () => {
    expect(example.get('S3_ACCESS_KEY_ID')?.length).toBeGreaterThanOrEqual(8)
    expect(example.has('S3_SECRET_ACCESS_KEY')).toBe(true)
    expect(example.has('GARAGE_RPC_SECRET')).toBe(true)
    expect(example.has('GARAGE_ADMIN_TOKEN')).toBe(true)
    expect([...example.keys()].filter((k) => k.startsWith('MINIO_') || k === 'MC_IMAGE')).toEqual(
      [],
    )
  })

  it('declares both data volumes', () => {
    expect(compose).toMatch(/^volumes:\n/m)
    expect(compose).toMatch(/^ {2}pgdata:/m)
    expect(compose).toMatch(/^ {2}garagedata:/m)
  })

  it('passes the optional USPS credentials to every app container, blank when unset', () => {
    const anchor = compose.slice(0, compose.indexOf('\nservices:'))
    expect(anchor).toContain('USPS_CLIENT_ID: ${USPS_CLIENT_ID:-}')
    expect(anchor).toContain('USPS_CLIENT_SECRET: ${USPS_CLIENT_SECRET:-}')
    expect(example.get('USPS_CLIENT_ID')).toBe('')
    expect(example.get('USPS_CLIENT_SECRET')).toBe('')
  })

  it('passes the health alert and log settings to every app container, blank when unset', () => {
    const anchor = compose.slice(0, compose.indexOf('\nservices:'))
    for (const key of HOST_TUNABLE_SETTINGS) {
      expect(anchor, key).toContain(`${key}: \${${key}:-}`)
      expect(example.get(key), key).toBe('')
    }
  })

  it('the app accepts every setting the compose file can pass blank', () => {
    const anchor = compose.slice(0, compose.indexOf('\nservices:'))
    const blankable = [...anchor.matchAll(/^\s+([A-Z][A-Z0-9_]*): \$\{\1:-\}$/gm)].map(
      (m) => m[1] ?? '',
    )
    expect(blankable).toEqual(expect.arrayContaining([...HOST_TUNABLE_SETTINGS]))
    const blanks = Object.fromEntries(blankable.map((key) => [key, '']))
    const parsed = envSchema.safeParse({ ...VALID_REQUIRED, ...blanks })
    expect(parsed.error?.issues ?? []).toEqual([])
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
