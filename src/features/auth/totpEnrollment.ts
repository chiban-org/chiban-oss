import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { users } from '@/db/schema'
import { generateTotpSecret, totpUri, verifyTotp } from '@/features/auth/totp'
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
  await db
    .update(users)
    .set({ totpSecretEnc: encryptSecret(secret) })
    .where(eq(users.id, userId))
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
  if (!secret.ok || !verifyTotp(secret.value, code.trim())) return err('invalid_code')
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, userId))
  return ok(undefined)
}
