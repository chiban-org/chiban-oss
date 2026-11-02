import { eq } from 'drizzle-orm'
import { env } from '@/config/env'
import type { DbOrTx } from '@/db/client'
import { users } from '@/db/schema'
import { createSession } from '@/features/auth/session'
import { DEMO_DOMAIN } from '@/features/demo/seedDemo'
import { err, ok, type Result } from '@/types/result'

export function isDevSignInEnabled(): boolean {
  return env.NODE_ENV !== 'production' && env.ENABLE_DEV_SIGN_IN
}

export async function devSignIn(
  db: DbOrTx,
  email: string,
  signal: AbortSignal,
): Promise<Result<{ sid: string }, 'disabled' | 'not_found'>> {
  if (!isDevSignInEnabled()) return err('disabled')
  const normalized = email.trim().toLowerCase()
  if (!normalized.endsWith(`@${DEMO_DOMAIN}`)) return err('not_found')
  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1)
  if (user?.isActive !== true) return err('not_found')
  const session = await createSession(db, user.id, signal)
  if (!session.ok) return err('not_found')
  return ok({ sid: session.value.sid })
}
