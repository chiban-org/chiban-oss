import { redirect } from 'next/navigation'
import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { getActor } from '@/server/getActor'
import { createContext } from '@/server/trpc/context'

export interface StaffContext {
  db: Db
  actor: Actor
  signal: AbortSignal
}

export async function staffActorOrNull(signal: AbortSignal): Promise<Actor | null> {
  const actor = await getActor(signal)
  return actor?.kind === 'staff' ? actor : null
}

export async function requireStaffActor(signal: AbortSignal): Promise<Actor> {
  const actor = await staffActorOrNull(signal)
  if (actor === null) redirect('/staff/sign-in')
  return actor
}

export async function requireStaffContext(): Promise<StaffContext> {
  const ctx = await createContext()
  if (ctx.actor?.kind !== 'staff') redirect('/staff/sign-in')
  return { db: ctx.db, actor: ctx.actor, signal: ctx.signal }
}
