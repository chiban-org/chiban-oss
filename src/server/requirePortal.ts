import { redirect } from 'next/navigation'
import type { Db } from '@/db/client'
import { db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { getActor } from '@/server/getActor'

export interface PortalContext {
  db: Db
  actor: Actor
  signal: AbortSignal
}

const PORTAL_TIMEOUT_MS = 15_000

export async function portalActorOrNull(signal: AbortSignal): Promise<Actor | null> {
  return await getActor(signal)
}

export async function requirePortalContext(returnTo: string): Promise<PortalContext> {
  const signal = AbortSignal.timeout(PORTAL_TIMEOUT_MS)
  const actor = await portalActorOrNull(signal)
  if (actor === null) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`)
  return { db, actor, signal }
}
