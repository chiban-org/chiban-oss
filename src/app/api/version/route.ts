import { env } from '@/config/env'
import { db } from '@/db/client'
import { versionResponse } from '@/features/health/version'

export const dynamic = 'force-dynamic'

export function GET(): Promise<Response> {
  return versionResponse(db, AbortSignal.timeout(5000), env.CHIBAN_IMAGE_REF ?? null)
}
