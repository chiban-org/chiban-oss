import { createRateLimiter } from '@/server/rateLimiter'

const MAX_SIGN_INS = 30
const WINDOW_MS = 10 * 60 * 1000

const limiter = createRateLimiter({ max: MAX_SIGN_INS, windowMs: WINDOW_MS })

export function takeDemoSignIn(clientKey: string): boolean {
  limiter.prune()
  if (limiter.isLimited(clientKey)) return false
  limiter.recordFailure(clientKey)
  return true
}

export function resetDemoSignInLimiter(): void {
  limiter.reset()
}
