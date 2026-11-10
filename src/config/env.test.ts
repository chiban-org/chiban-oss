import { afterEach, describe, expect, it, vi } from 'vitest'
import { envSchema } from '@/config/env'
import { ENV_PREFIXES_STRICT, findUndeclaredKeys } from '@/config/envStrict'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BASE_URL: 'https://alderpond.example',
  CHIBAN_SECRET_KEYS: JSON.stringify({ k1: Buffer.alloc(32, 1).toString('base64') }),
  CHIBAN_ACTIVE_KEY_ID: 'k1',
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.restoreAllMocks()
})

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

describe('demo environment', () => {
  const demo = {
    ...base,
    NODE_ENV: 'production',
    CHIBAN_DEMO_MODE: 'true',
    CHIBAN_DEMO_RESET_AT: '3:00 AM Eastern',
    SMTP_URL: 'smtp://mailpit:1025',
    ENABLE_SIMULATED_PAYMENTS: 'true',
  }

  function failingPaths(input: Record<string, string>): string[] {
    const parsed = envSchema.safeParse(input)
    return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join('.'))
  }

  it('is off by default and sinks mail at mailpit', () => {
    const parsed = envSchema.parse(base)
    expect(parsed.CHIBAN_DEMO_MODE).toBe(false)
    expect(parsed.CHIBAN_DEMO_MAIL_SINK_HOSTS).toEqual(['mailpit'])
    expect(parsed.CHIBAN_DEMO_RESET_AT).toBeUndefined()
  })

  it('accepts a production demo that sends mail to the sink', () => {
    expect(failingPaths(demo)).toEqual([])
  })

  it('reads an optional overlay file path and treats a blank one as unset', () => {
    expect(envSchema.parse(demo).CHIBAN_DEMO_OVERLAY_FILE).toBeUndefined()
    expect(
      envSchema.parse({ ...demo, CHIBAN_DEMO_OVERLAY_FILE: '' }).CHIBAN_DEMO_OVERLAY_FILE,
    ).toBe(undefined)
    expect(
      envSchema.parse({ ...demo, CHIBAN_DEMO_OVERLAY_FILE: '/etc/chiban/overlay.json' })
        .CHIBAN_DEMO_OVERLAY_FILE,
    ).toBe('/etc/chiban/overlay.json')
  })

  it('refuses a demo whose mail goes anywhere but an allowed sink host', () => {
    expect(
      failingPaths({ ...demo, SMTP_URL: 'smtps://user:pass@smtp.mailer.example:465' }),
    ).toEqual(['SMTP_URL'])
    expect(failingPaths({ ...demo, SMTP_URL: 'not a url' })).toEqual(['SMTP_URL'])
  })

  it('refuses SMTP options that would send mail somewhere other than the sink host', () => {
    expect(
      failingPaths({ ...demo, SMTP_URL: 'smtp://user:pass@mailpit:1025?service=gmail' }),
    ).toEqual(['SMTP_URL'])
    expect(
      failingPaths({ ...demo, SMTP_URL: 'smtp://mailpit:1025?host=smtp.mailer.example' }),
    ).toEqual(['SMTP_URL'])
  })

  it('needs simulated payments so applicants can finish a card payment', () => {
    expect(failingPaths({ ...demo, ENABLE_SIMULATED_PAYMENTS: 'false' })).toEqual([
      'ENABLE_SIMULATED_PAYMENTS',
    ])
  })

  it('takes the allowed sink hosts from a comma list', () => {
    const local = { ...demo, SMTP_URL: 'smtp://localhost:1026' }
    expect(failingPaths(local)).toEqual(['SMTP_URL'])
    expect(failingPaths({ ...local, CHIBAN_DEMO_MAIL_SINK_HOSTS: 'mailpit, localhost' })).toEqual(
      [],
    )
  })

  it('needs the reset time the banner shows', () => {
    const { CHIBAN_DEMO_RESET_AT: _unused, ...withoutReset } = demo
    expect(failingPaths(withoutReset)).toEqual(['CHIBAN_DEMO_RESET_AT'])
  })

  it('leaves mail alone when demo mode is off', () => {
    expect(
      failingPaths({ ...base, NODE_ENV: 'production', SMTP_URL: 'smtps://smtp.mailer.example' }),
    ).toEqual([])
  })
})

describe('usps environment', () => {
  it('leaves address checks off when nothing is set or the values are blank', () => {
    const parsed = envSchema.parse({ ...base, USPS_CLIENT_ID: '', USPS_CLIENT_SECRET: '' })
    expect(parsed.USPS_CLIENT_ID).toBeUndefined()
    expect(parsed.USPS_CLIENT_SECRET).toBeUndefined()
    expect(parsed.USPS_STUB).toBe(false)
    expect(parsed.USPS_API_BASE).toBe('https://apis.usps.com')
  })

  it('a client id without a secret fails env parsing', () => {
    const parsed = envSchema.safeParse({ ...base, USPS_CLIENT_ID: 'consumer-key' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toContain('USPS_CLIENT_SECRET')
  })

  it('a secret without a client id fails env parsing', () => {
    const parsed = envSchema.safeParse({ ...base, USPS_CLIENT_SECRET: 'consumer-secret' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toContain('USPS_CLIENT_ID')
  })

  it('USPS_STUB in production fails env parsing', () => {
    const parsed = envSchema.safeParse({ ...base, NODE_ENV: 'production', USPS_STUB: 'true' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((i) => i.path.join('.'))).toContain('USPS_STUB')
  })

  it('accepts the testing environment base', () => {
    const parsed = envSchema.parse({ ...base, USPS_API_BASE: 'https://apis-tem.usps.com' })
    expect(parsed.USPS_API_BASE).toBe('https://apis-tem.usps.com')
  })
})

describe('ocr environment', () => {
  it('OCRMYPDF_PATH defaults to ocrmypdf and can be overridden', () => {
    expect(envSchema.parse(base).OCRMYPDF_PATH).toBe('ocrmypdf')
    expect(envSchema.parse({ ...base, OCRMYPDF_PATH: '/opt/ocr/ocrmypdf' }).OCRMYPDF_PATH).toBe(
      '/opt/ocr/ocrmypdf',
    )
  })
})

describe('veraPDF environment', () => {
  it('VERAPDF_PATH defaults to verapdf on the PATH and can be overridden', () => {
    expect(envSchema.parse(base).VERAPDF_PATH).toBe('verapdf')
    expect(envSchema.parse({ ...base, VERAPDF_PATH: '/opt/verapdf/verapdf' }).VERAPDF_PATH).toBe(
      '/opt/verapdf/verapdf',
    )
  })
})

describe('strict env prefixes', () => {
  it('lists the prefixes the product owns', () => {
    expect(ENV_PREFIXES_STRICT).toEqual([
      'CHIBAN_',
      'S3_',
      'SMTP_',
      'HEALTH_',
      'ALERT_',
      'PAGER_',
      'EXPORT_',
      'GHOSTSCRIPT_',
      'BACKUP_',
      'USPS_',
    ])
  })

  it('reports only prefixed keys the schema does not declare', () => {
    const found = findUndeclaredKeys(
      ['CHIBAN_ACTIVE_KEY_ID', 'CHIBAN_TYPO', 'S3_BUCKET', 'S3_BUKET', 'HOME', 'EXPORT_WORK_DIR'],
      ['CHIBAN_ACTIVE_KEY_ID', 'S3_BUCKET', 'EXPORT_WORK_DIR'],
    )
    expect(found).toEqual(['CHIBAN_TYPO', 'S3_BUKET'])
  })

  it('declares the optional image ref and the term gate file', () => {
    expect(Object.keys(envSchema.shape)).toEqual(
      expect.arrayContaining(['CHIBAN_IMAGE_REF', 'CHIBAN_TERMS_FILE']),
    )
  })

  it('treats the image ref as optional', () => {
    expect(envSchema.shape.CHIBAN_IMAGE_REF.safeParse(undefined).success).toBe(true)
  })
})

describe('loadEnv', () => {
  it('an undeclared CHIBAN_ key fails env parsing', async () => {
    vi.stubEnv('CHIBAN_NOT_A_REAL_KEY', 'x')
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${String(code)}`)
    })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(import('@/config/env')).rejects.toThrow('exit 1')
    expect(exit).toHaveBeenCalledWith(1)
    expect(String(logged.mock.calls[0]?.[0])).toContain('CHIBAN_NOT_A_REAL_KEY')
  })

  it('loads when every prefixed key is declared', async () => {
    vi.stubEnv('CHIBAN_IMAGE_REF', 'registry.example/chiban@sha256:abc')
    const mod = await import('@/config/env')
    expect(mod.env.CHIBAN_IMAGE_REF).toBe('registry.example/chiban@sha256:abc')
  })
})
