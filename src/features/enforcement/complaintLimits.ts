import { createRateLimiter } from '@/server/rateLimiter'

const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_WINDOW = 5

const byClient = createRateLimiter({ max: MAX_PER_WINDOW, windowMs: WINDOW_MS })

export const COMPLAINT_RATE_LIMITED_COPY =
  'Too many reports from this connection. Try again in a few minutes.'

export function resetComplaintLimits(): void {
  byClient.reset()
}

export function takeComplaintAllowance(clientKey: string): boolean {
  byClient.prune()
  if (byClient.isLimited(clientKey)) return false
  byClient.recordFailure(clientKey)
  return true
}
