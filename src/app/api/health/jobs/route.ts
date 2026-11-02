import { db } from '@/db/client'
import { jobsHealthResponse } from '@/features/health/jobsRoute'

export const dynamic = 'force-dynamic'

export function GET(): Promise<Response> {
  return jobsHealthResponse(db, AbortSignal.timeout(5000))
}
