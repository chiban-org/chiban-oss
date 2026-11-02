import { redirect } from 'next/navigation'
import type { Actor } from '@/features/auth/actor'
import { getActor } from '@/server/getActor'

export async function requireStaffActor(signal: AbortSignal): Promise<Actor> {
  const actor = await getActor(signal)
  if (actor?.kind !== 'staff') redirect('/staff/sign-in')
  return actor
}
