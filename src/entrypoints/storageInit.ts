import { env } from '@/config/env'
import { corsOriginsFor } from '@/features/storage/corsOrigins'
import { objectStoreConfigFromEnv } from '@/features/storage/objectStore'
import { prepareBucket } from '@/features/storage/prepareBucket'

const origins = corsOriginsFor(env)
const prepared = await prepareBucket(
  objectStoreConfigFromEnv(),
  { endpoint: env.GARAGE_ADMIN_ENDPOINT, token: env.GARAGE_ADMIN_TOKEN },
  origins,
  AbortSignal.timeout(60_000),
)
if (!prepared.ok) {
  const { operation, status, message } = prepared.error
  console.error(`storage init failed at ${operation} (${status}): ${message}`)
  process.exit(1)
}
console.warn(`bucket ${env.S3_BUCKET} ready at ${env.S3_ENDPOINT} for ${origins.join(', ')}`)
