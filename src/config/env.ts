import { z } from 'zod'
import { findUndeclaredKeys } from '@/config/envStrict'

const boolFromString = z.enum(['true', 'false']).transform((v) => v === 'true')

const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/

const secretKeys = z
  .string()
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be a JSON object' })
      return z.NEVER
    }
  })
  .pipe(
    z
      .record(z.string().regex(KEY_ID), z.string())
      .refine(
        (keys) => Object.values(keys).every((k) => Buffer.from(k, 'base64').length === 32),
        'every key must be base64 of exactly 32 bytes',
      ),
  )

const blankAsUnset = (value: unknown) => (value === '' ? undefined : value)

const optionalSecret = z.preprocess(blankAsUnset, z.string().min(1).optional())

const commaList = (item: z.ZodType<string, string>) =>
  z
    .string()
    .transform((raw) =>
      raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== ''),
    )
    .pipe(z.array(item))

function mailHostIn(smtpUrl: string, hosts: readonly string[]): boolean {
  try {
    const url = new URL(smtpUrl)
    if (url.search !== '') return false
    const host = url.hostname.toLowerCase()
    return hosts.some((allowed) => allowed.toLowerCase() === host)
  } catch {
    return false
  }
}

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DATABASE_URL: z.string().min(1),
    BASE_URL: z.url(),
    SMTP_URL: z.string().min(1).default('smtp://localhost:1025'),
    MAIL_FROM: z.string().min(3).default('Town of Alder Pond <noreply@alderpond.example>'),
    ENABLE_DEV_SIGN_IN: boolFromString.default(false),
    ENABLE_SIMULATED_PAYMENTS: boolFromString.default(false),
    STRIPE_API_BASE: z.url().optional(),
    S3_ENDPOINT: z.url().default('http://localhost:9010'),
    S3_PUBLIC_ENDPOINT: z.url().default('http://localhost:9010'),
    S3_BUCKET: z.string().min(3).default('chiban'),
    S3_ACCESS_KEY_ID: z.string().min(1).default('chiban-dev'),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default('chiban-dev-secret'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_CORS_ORIGINS: commaList(z.url()).default([]),
    GARAGE_ADMIN_ENDPOINT: z.url().default('http://localhost:9011'),
    GARAGE_ADMIN_TOKEN: z.string().min(1).default('chiban-dev-admin-token'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(104_857_600),
    PATH: z.string().optional(),
    PG_DUMP_PATH: z.string().min(1).default('pg_dump'),
    PG_RESTORE_PATH: z.string().min(1).default('pg_restore'),
    BACKUP_PASSPHRASE: z.string().min(16).optional(),
    EXPORT_WORK_DIR: z.string().min(1).default('/tmp/chiban-export'),
    GHOSTSCRIPT_PATH: z.string().min(1).default('gs'),
    GHOSTSCRIPT_ICC_PROFILE: z.string().min(1).optional(),
    OCRMYPDF_PATH: z.string().min(1).default('ocrmypdf'),
    VERAPDF_PATH: z.string().min(1).default('verapdf'),
    ALERT_EMAIL_TO: commaList(z.email()).default([]),
    HEALTH_DISK_PATHS: commaList(z.string().min(1)).default(['/']),
    HEALTH_HEARTBEAT_URL: z.url().optional(),
    PAGER_EVENTS_URL: z.url().optional(),
    PAGER_ROUTING_KEY: z.string().min(1).optional(),
    CHIBAN_SECRET_KEYS: secretKeys,
    CHIBAN_ACTIVE_KEY_ID: z.string().regex(KEY_ID),
    CHIBAN_IMAGE_REF: z.string().min(1).optional(),
    CHIBAN_TERMS_FILE: z.string().optional(),
    USPS_CLIENT_ID: optionalSecret,
    USPS_CLIENT_SECRET: optionalSecret,
    USPS_API_BASE: z.preprocess(blankAsUnset, z.url().default('https://apis.usps.com')),
    USPS_STUB: z.preprocess(blankAsUnset, boolFromString.default(false)),
    CHIBAN_DEMO_MODE: boolFromString.default(false),
    CHIBAN_DEMO_RESET_AT: z.preprocess(blankAsUnset, z.string().min(1).max(60).optional()),
    CHIBAN_DEMO_MAIL_SINK_HOSTS: commaList(z.string().min(1)).default(['mailpit']),
    NEXT_RUNTIME: z.enum(['nodejs', 'edge']).optional(),
  })
  .refine((v) => v.CHIBAN_ACTIVE_KEY_ID in v.CHIBAN_SECRET_KEYS, {
    path: ['CHIBAN_ACTIVE_KEY_ID'],
    message: 'must name a key present in CHIBAN_SECRET_KEYS',
  })
  .refine((v) => v.PAGER_EVENTS_URL === undefined || v.PAGER_ROUTING_KEY !== undefined, {
    path: ['PAGER_ROUTING_KEY'],
    message: 'is required when PAGER_EVENTS_URL is set',
  })
  .refine((v) => v.NODE_ENV !== 'production' || v.STRIPE_API_BASE === undefined, {
    path: ['STRIPE_API_BASE'],
    message: 'must not be set in production',
  })
  .refine((v) => v.USPS_CLIENT_ID === undefined || v.USPS_CLIENT_SECRET !== undefined, {
    path: ['USPS_CLIENT_SECRET'],
    message: 'is required when USPS_CLIENT_ID is set',
  })
  .refine((v) => v.USPS_CLIENT_SECRET === undefined || v.USPS_CLIENT_ID !== undefined, {
    path: ['USPS_CLIENT_ID'],
    message: 'is required when USPS_CLIENT_SECRET is set',
  })
  .refine((v) => v.NODE_ENV !== 'production' || !v.USPS_STUB, {
    path: ['USPS_STUB'],
    message: 'must not be set in production',
  })
  .refine((v) => !v.CHIBAN_DEMO_MODE || mailHostIn(v.SMTP_URL, v.CHIBAN_DEMO_MAIL_SINK_HOSTS), {
    path: ['SMTP_URL'],
    message:
      'must point at a host in CHIBAN_DEMO_MAIL_SINK_HOSTS, with no query options, when CHIBAN_DEMO_MODE is on',
  })
  .refine((v) => !v.CHIBAN_DEMO_MODE || v.ENABLE_SIMULATED_PAYMENTS, {
    path: ['ENABLE_SIMULATED_PAYMENTS'],
    message: 'must be true when CHIBAN_DEMO_MODE is on, so the simulated checkout works',
  })
  .refine((v) => !v.CHIBAN_DEMO_MODE || v.CHIBAN_DEMO_RESET_AT !== undefined, {
    path: ['CHIBAN_DEMO_RESET_AT'],
    message: 'is required when CHIBAN_DEMO_MODE is on',
  }) satisfies z.ZodType

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  const undeclared = findUndeclaredKeys(Object.keys(process.env), Object.keys(envSchema.shape))
  if (!parsed.success || undeclared.length > 0) {
    const issues = parsed.success ? [] : parsed.error.issues
    const lines = [
      ...issues.map((i) => `  ${i.path.join('.')}: ${i.message}`),
      ...undeclared.map((key) => `  ${key}: not a recognised setting`),
    ]
    console.error(`[env] invalid configuration:\n${lines.join('\n')}`)
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()
