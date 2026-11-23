import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { completenessCopy } from '@/features/applications/completenessStep'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  classificationOfApplication,
  mayActOnClassification,
} from '@/features/authz/classificationScope'
import { keysSatisfiedByCompletion } from '@/features/clocks/ruleEngine'
import { markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import { loadPack } from '@/features/packs/loadPack'
import { isBuildingPermit } from '@/features/packs/roles'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export async function mayMarkComplete(
  db: DbOrTx,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (await hasCapability(db, actor.userId, 'application.manage', signal)) return true
  const classification = await classificationOfApplication(db, applicationId, signal)
  return await mayActOnClassification(db, actor, 'permit.issue', classification, signal)
}

export async function markComplete(
  db: DbOrTx,
  actor: Actor,
  input: { applicationId: string; completedDate: CivilDate },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    void,
    | 'forbidden'
    | 'not_found'
    | 'not_submitted'
    | 'before_receipt'
    | 'future_date'
    | 'already_complete'
  >
> {
  signal.throwIfAborted()
  if (!(await mayMarkComplete(db, actor, input.applicationId, signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    if (app.state === 'draft' || app.receivedDate === null) return err('not_submitted')
    if (app.completedDate !== null) return err('already_complete')
    if (input.completedDate < app.receivedDate) return err('before_receipt')
    const today = await townToday(tx, now, signal)
    if (input.completedDate > today) return err('future_date')
    await tx
      .update(applications)
      .set({ completedDate: input.completedDate, updatedAt: new Date() })
      .where(eq(applications.id, input.applicationId))
    await startClocksFor(
      tx,
      input.applicationId,
      'application_completed',
      input.completedDate,
      signal,
    )
    for (const key of keysSatisfiedByCompletion(loadPack().rules)) {
      await markClockMet(tx, input.applicationId, key, input.completedDate, signal)
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'building.mark_complete',
        entityType: 'application',
        entityId: input.applicationId,
        before: { completedDate: app.completedDate },
        after: { completedDate: input.completedDate },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function markedCompleteMessage(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<string> {
  const app = await loadApplicationContext(db, applicationId, signal)
  const classification = app?.typeBody.classification
  return completenessCopy({ isBuildingPermit: isBuildingPermit(classification), classification })
    .marked
}
