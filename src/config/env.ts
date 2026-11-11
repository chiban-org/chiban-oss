import { type Env, envSchema } from '@/config/envSchema'
import { findUndeclaredKeys } from '@/config/envStrict'

export { type Env, envSchema } from '@/config/envSchema'

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
