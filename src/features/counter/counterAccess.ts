import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'

export async function mayUseCounter(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<boolean> {
  return (
    (await hasCapability(db, actor.userId, 'permit.issue', signal)) &&
    (await hasCapability(db, actor.userId, 'payment.collect', signal))
  )
}
