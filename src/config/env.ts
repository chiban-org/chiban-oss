import { z } from 'zod'

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
    S3_ACCESS_KEY_ID: z.string().min(1).default('chiban'),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default('chiban-dev-secret'),
    S3_REGION: z.string().min(1).default('us-east-1'),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(104_857_600),
    PATH: z.string().optional(),
    PG_DUMP_PATH: z.string().min(1).default('pg_dump'),
    EXPORT_WORK_DIR: z.string().min(1).default('/tmp/chiban-export'),
    GHOSTSCRIPT_PATH: z.string().min(1).default('gs'),
    GHOSTSCRIPT_ICC_PROFILE: z.string().min(1).optional(),
    ALERT_EMAIL_TO: commaList(z.email()).default([]),
    HEALTH_DISK_PATHS: commaList(z.string().min(1)).default(['/']),
    HEALTH_HEARTBEAT_URL: z.url().optional(),
    PAGER_EVENTS_URL: z.url().optional(),
    PAGER_ROUTING_KEY: z.string().min(1).optional(),
    CHIBAN_SECRET_KEYS: secretKeys,
    CHIBAN_ACTIVE_KEY_ID: z.string().regex(KEY_ID),
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
  }) satisfies z.ZodType

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    console.error(`[env] invalid configuration:\n${lines.join('\n')}`)
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()
