import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/createStaffUser'
import { hashPassword, verifyPassword } from '@/features/auth/password'
import { revokeOtherSessions } from '@/features/auth/session'
import { createRateLimiter } from '@/server/rateLimiter'
import { err, ok, type Result } from '@/types/result'

const MAX_FAILURES = 5
const WINDOW_MS = 10 * 60 * 1000
const MAX_NAME_LENGTH = 120
const DUMMY_HASH = `scrypt$32768$8$1$${'A'.repeat(22)}$${'A'.repeat(86)}`

const limiter = createRateLimiter({ max: MAX_FAILURES, windowMs: WINDOW_MS })

export function resetPasswordChangeLimiter(): void {
  limiter.reset()
}

export async function changeDisplayName(
  db: Db,
  userId: string,
  name: string,
  signal: AbortSignal,
): Promise<Result<void, 'invalid_name'>> {
  signal.throwIfAborted()
  const displayName = name.trim()
  if (displayName === '' || displayName.length > MAX_NAME_LENGTH) return err('invalid_name')
  return await transactionResult(db, async (tx) => {
    const [before] = await tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
    await tx.update(users).set({ displayName }).where(eq(users.id, userId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId },
        action: 'user.name.change',
        entityType: 'user',
        entityId: userId,
        before: { displayName: before?.displayName ?? null },
        after: { displayName },
      },
      signal,
    )
    return ok(undefined)
  })
}

export interface ChangePasswordInput {
  userId: string
  current: string
  next: string
  keepSid: string | null
}

export type ChangePasswordError = 'wrong_password' | 'weak_password' | 'unchanged' | 'rate_limited'

export async function changeOwnPassword(
  db: Db,
  input: ChangePasswordInput,
  signal: AbortSignal,
): Promise<Result<void, ChangePasswordError>> {
  signal.throwIfAborted()
  if (limiter.isLimited(input.userId)) return err('rate_limited')
  limiter.recordFailure(input.userId)
  if (input.next.length < MIN_PASSWORD_LENGTH) return err('weak_password')
  const [user] = await db
    .select({ passwordHash: users.passwordHash, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, input.userId))
  const stored = user?.isActive === true ? user.passwordHash : null
  const verified = await verifyPassword(input.current, stored ?? DUMMY_HASH, signal)
  if (stored === null || !verified) return err('wrong_password')
  if (input.next === input.current) {
    limiter.clear(input.userId)
    return err('unchanged')
  }
  const passwordHash = await hashPassword(input.next, signal)
  return await transactionResult<void, ChangePasswordError>(db, async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash })
      .where(and(eq(users.id, input.userId), eq(users.passwordHash, stored)))
      .returning({ id: users.id })
    if (updated.length === 0) return err('wrong_password')
    await revokeOtherSessions(tx, input.userId, input.keepSid, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: input.userId },
        action: 'user.password.change',
        entityType: 'user',
        entityId: input.userId,
      },
      signal,
    )
    limiter.clear(input.userId)
    return ok(undefined)
  })
}
