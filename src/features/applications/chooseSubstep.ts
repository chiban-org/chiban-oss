import type { Tx } from '@/db/client'
import { setSubstep } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { err } from '@/types/result'

export async function chooseSubstep(
  tx: Tx,
  actor: Actor,
  input: Parameters<typeof setSubstep>[2],
  signal: AbortSignal,
): ReturnType<typeof setSubstep> {
  if (!(await hasCapability(tx, actor.userId, 'application.manage', signal))) {
    return err('forbidden')
  }
  return await setSubstep(tx, actor, input, signal)
}
