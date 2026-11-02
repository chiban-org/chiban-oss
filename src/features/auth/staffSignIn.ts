import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { users } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { verifyPassword } from '@/features/auth/password'
import { createSession } from '@/features/auth/session'
import { verifyTotp } from '@/features/auth/totp'
import { createRateLimiter } from '@/server/rateLimiter'
import { decryptSecret } from '@/server/secrets'
import { err, ok, type Result } from '@/types/result'

const MAX_FAILURES = 6
const WINDOW_MS = 10 * 60 * 1000
const DUMMY_HASH = `scrypt$32768$8$1$${'A'.repeat(22)}$${'A'.repeat(86)}`

const limiter = createRateLimiter({ max: MAX_FAILURES, windowMs: WINDOW_MS })

export function resetStaffSignInLimiter(): void {
  limiter.reset()
}

export interface StaffSignInInput {
  email: string
  password: string
  totp?: string
}

type StaffSignInError = 'invalid_credentials' | 'totp_required' | 'rate_limited'

function checkSecondFactor(
  secretEnc: string | null,
  rawCode: string | undefined,
): 'required' | 'rejected' | 'accepted' {
  const code = rawCode?.trim() ?? ''
  if (code === '') return 'required'
  const secret = decryptSecret(secretEnc ?? '')
  return secret.ok && verifyTotp(secret.value, code) ? 'accepted' : 'rejected'
}

export async function staffSignIn(
  db: DbOrTx,
  input: StaffSignInInput,
  signal: AbortSignal,
): Promise<Result<{ sid: string }, StaffSignInError>> {
  signal.throwIfAborted()
  const key = input.email.trim().toLowerCase()
  if (limiter.isLimited(key)) return err('rate_limited')

  const [user] = await db.select().from(users).where(eq(users.email, key)).limit(1)
  const eligible = user?.isActive === true && user.kind === 'staff' && user.passwordHash !== null
  const passwordOk = await verifyPassword(
    input.password,
    eligible ? (user.passwordHash ?? DUMMY_HASH) : DUMMY_HASH,
    signal,
  )
  if (!eligible || !passwordOk) {
    limiter.recordFailure(key)
    return err('invalid_credentials')
  }

  if (user.totpEnabled) {
    const second = checkSecondFactor(user.totpSecretEnc, input.totp)
    if (second === 'required') return err('totp_required')
    if (second === 'rejected') {
      limiter.recordFailure(key)
      return err('invalid_credentials')
    }
  }

  const session = await createSession(db, user.id, signal)
  if (!session.ok) return err('invalid_credentials')
  limiter.clear(key)
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: user.id },
      action: 'auth.staff_sign_in',
      entityType: 'user',
      entityId: user.id,
    },
    signal,
  )
  return ok({ sid: session.value.sid })
}
