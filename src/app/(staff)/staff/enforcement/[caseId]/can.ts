import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'

export interface Can {
  manage: boolean
  issue: boolean
  service: boolean
  counsel: boolean
  fine: boolean
  collect: boolean
}

export async function loadCan(db: DbOrTx, actor: Actor, signal: AbortSignal): Promise<Can> {
  const [manage, issue, service, counsel, fine, collect] = await Promise.all([
    hasCapability(db, actor.userId, 'enforcement.manage', signal),
    hasCapability(db, actor.userId, 'enforcement.issue_order', signal),
    hasCapability(db, actor.userId, 'enforcement.record_service', signal),
    hasCapability(db, actor.userId, 'enforcement.refer_counsel', signal),
    hasCapability(db, actor.userId, 'fine.record', signal),
    hasCapability(db, actor.userId, 'payment.collect', signal),
  ])
  return { manage, issue, service, counsel, fine, collect }
}
