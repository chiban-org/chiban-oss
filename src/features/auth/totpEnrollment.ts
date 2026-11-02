import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { users } from '@/db/schema'
import { generateTotpSecret, totpUri, verifyTotpCounter } from '@/features/auth/totp'
import { decryptSecret, encryptSecret } from '@/server/secrets'
import { err, ok, type Result } from '@/types/result'

export async function beginTotpEnrollment(
  db: DbOrTx,
  userId: string,
  signal: AbortSignal,
): Promise<Result<{ uri: string }, 'already_enrolled' | 'not_found'>> {
  signal.throwIfAborted()
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (user === undefined) return err('not_found')
  if (user.totpEnabled) return err('already_enrolled')
  const secret = generateTotpSecret()
  const written = await db
    .update(users)
    .set({ totpSecretEnc: encryptSecret(secret) })
    .where(and(eq(users.id, userId), eq(users.totpEnabled, false)))
    .returning({ id: users.id })
  if (written.length === 0) return err('already_enrolled')
  return ok({ uri: totpUri(secret, user.email) })
}

export async function pendingTotpUri(
  db: DbOrTx,
  userId: string,
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted()
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (user === undefined || user.totpEnabled || user.totpSecretEnc === null) return null
  const secret = decryptSecret(user.totpSecretEnc)
  return secret.ok ? totpUri(secret.value, user.email) : null
}

export async function confirmTotpEnrollment(
  db: DbOrTx,
  userId: string,
  code: string,
  signal: AbortSignal,
): Promise<Result<void, 'invalid_code' | 'not_pending'>> {
  signal.throwIfAborted()
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (user === undefined || user.totpEnabled || user.totpSecretEnc === null)
    return err('not_pending')
  const secret = decryptSecret(user.totpSecretEnc)
  const counter = secret.ok ? verifyTotpCounter(secret.value, code.trim()) : null
  if (counter === null) return err('invalid_code')
  const enabled = await db
    .update(users)
    .set({ totpEnabled: true, totpLastCounter: counter })
    .where(
      and(
        eq(users.id, userId),
        eq(users.totpSecretEnc, user.totpSecretEnc),
        eq(users.totpEnabled, false),
      ),
    )
    .returning({ id: users.id })
  return enabled.length === 0 ? err('not_pending') : ok(undefined)
}
