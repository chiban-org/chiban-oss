import { db } from '@/db/client'
import { healthResponse } from '@/features/health/health'

export const dynamic = 'force-dynamic'

export function GET(): Promise<Response> {
  return healthResponse(db, AbortSignal.timeout(5000))
}
