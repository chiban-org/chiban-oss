import type { DbOrTx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { mayActOnApplication } from '@/features/authz/classificationScope'
import { hasFullRecordAccess } from '@/features/projects/access'

export function isCorrectablePermit(app: Pick<ApplicationContext, 'state' | 'closureReason'>) {
  return app.state === 'issued' || (app.state === 'closed' && app.closureReason === 'issuance')
}

export async function mayCorrectPermits(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (!hasFullRecordAccess(actor)) return false
  const amends = await mayActOnApplication(
    db,
    actor,
    'application.amend_after_review',
    applicationId,
    signal,
  )
  return amends && (await mayActOnApplication(db, actor, 'permit.issue', applicationId, signal))
}
