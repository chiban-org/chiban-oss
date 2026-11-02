import { and, eq, isNull, lt, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { users } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { verifyPassword } from '@/features/auth/password'
import { verifyTotpCounter } from '@/features/auth/totp'
import { createRateLimiter } from '@/server/rateLimiter'
import { decryptSecret } from '@/server/secrets'
import { err, ok, type Result } from '@/types/result'

const MAX_FAILURES = 5
const WINDOW_MS = 10 * 60 * 1000
const DUMMY_HASH = `scrypt$32768$8$1$${'A'.repeat(22)}$${'A'.repeat(86)}`

const limiter = createRateLimiter({ max: MAX_FAILURES, windowMs: WINDOW_MS })

export function resetStepUpLimiter(): void {
  limiter.reset()
}

async function consumeCounter(db: DbOrTx, userId: string, counter: number): Promise<boolean> {
  const consumed = await db
    .update(users)
    .set({ totpLastCounter: counter })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.totpLastCounter), lt(users.totpLastCounter, counter)),
      ),
    )
    .returning({ id: users.id })
  return consumed.length > 0
}

export async function verifyStepUp(
  db: DbOrTx,
  actor: Actor,
  input: { password: string; totp: string },
  signal: AbortSignal,
): Promise<Result<void, 'invalid_credentials' | 'rate_limited'>> {
  signal.throwIfAborted()
  if (limiter.isLimited(actor.userId)) return err('rate_limited')
  limiter.recordFailure(actor.userId)
  const [user] = await db.select().from(users).where(eq(users.id, actor.userId)).limit(1)
  const eligible = user?.isActive === true && user.passwordHash !== null
  const passwordOk = await verifyPassword(
    input.password,
    eligible ? (user.passwordHash ?? DUMMY_HASH) : DUMMY_HASH,
    signal,
  )
  if (!eligible || !passwordOk) return err('invalid_credentials')
  if (user.totpEnabled) {
    const secret = decryptSecret(user.totpSecretEnc ?? '')
    const counter = secret.ok ? verifyTotpCounter(secret.value, input.totp.trim()) : null
    if (counter === null) return err('invalid_credentials')
    if (!(await consumeCounter(db, user.id, counter))) return err('invalid_credentials')
  }
  limiter.clear(actor.userId)
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'auth.step_up',
      entityType: 'user',
      entityId: actor.userId,
    },
    signal,
  )
  return ok(undefined)
}
