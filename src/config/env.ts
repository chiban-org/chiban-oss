import { z } from 'zod'

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

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DATABASE_URL: z.string().min(1),
    BASE_URL: z.url(),
    SMTP_URL: z.string().min(1).default('smtp://localhost:1025'),
    MAIL_FROM: z.string().min(3).default('Town of Alder Pond <noreply@alderpond.example>'),
    CHIBAN_SECRET_KEYS: secretKeys,
    CHIBAN_ACTIVE_KEY_ID: z.string().regex(KEY_ID),
  })
  .refine((v) => v.CHIBAN_ACTIVE_KEY_ID in v.CHIBAN_SECRET_KEYS, {
    path: ['CHIBAN_ACTIVE_KEY_ID'],
    message: 'must name a key present in CHIBAN_SECRET_KEYS',
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
