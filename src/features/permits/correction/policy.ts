import type { DbOrTx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { hasFullRecordAccess } from '@/features/projects/access'

export function isCorrectablePermit(app: Pick<ApplicationContext, 'state' | 'closureReason'>) {
  return app.state === 'issued' || (app.state === 'closed' && app.closureReason === 'issuance')
}

export async function mayCorrectPermits(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<boolean> {
  if (!hasFullRecordAccess(actor)) return false
  const amends = await hasCapability(db, actor.userId, 'application.amend_after_review', signal)
  return amends && (await hasCapability(db, actor.userId, 'permit.issue', signal))
}
