import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'

export async function mayMigrate(db: DbOrTx, actor: Actor, signal: AbortSignal): Promise<boolean> {
  const manage = await hasCapability(db, actor.userId, 'document.manage', signal)
  return manage && (await hasCapability(db, actor.userId, 'parcel.manage', signal))
}
