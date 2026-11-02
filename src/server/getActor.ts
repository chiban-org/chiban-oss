import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { type Actor, loadActor } from '@/features/auth/actor'
import { loadSession } from '@/features/auth/session'

export async function getActor(signal: AbortSignal): Promise<Actor | null> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value
  if (sid === undefined) return null
  const live = await loadSession(db, sid, signal)
  if (!live.ok) return null
  return await loadActor(db, live.value.userId, signal)
}
