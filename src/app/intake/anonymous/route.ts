import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { handleAnonymousIntake } from '@/features/anonymousIntake/handler'
import { getObjectStore } from '@/features/storage/objectStore'
import { createRateLimiter } from '@/server/rateLimiter'

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_WINDOW = 5
const REQUEST_TIMEOUT_MS = 60_000

const limiter = createRateLimiter({ max: MAX_PER_WINDOW, windowMs: WINDOW_MS })

export async function POST(request: Request): Promise<Response> {
  return await handleAnonymousIntake(
    {
      db,
      store: getObjectStore(),
      now: () => new Date(),
      limiter,
      imageRef: env.CHIBAN_IMAGE_REF ?? null,
      appVersion: APP_VERSION,
    },
    request,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  )
}
