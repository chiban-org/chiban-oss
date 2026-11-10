import { env } from '@/config/env'
import type { DbOrTx } from '@/db/client'
import { loadSession, revokeAllSessions, revokeSession } from '@/features/auth/session'
import { ok, type Result } from '@/types/result'

export interface LogoutDeps {
  db: DbOrTx
  sid: string | null
  signal: AbortSignal
}

export async function logoutCore(
  deps: LogoutDeps,
): Promise<Result<{ userId: string | null }, never>> {
  const { db, sid, signal } = deps
  if (sid === null || sid.length === 0) return ok({ userId: null })
  const session = await loadSession(db, sid, signal)
  if (!session.ok) return ok({ userId: null })
  if (env.CHIBAN_DEMO_MODE) await revokeSession(db, sid, signal)
  else await revokeAllSessions(db, session.value.userId, signal)
  return ok({ userId: session.value.userId })
}
