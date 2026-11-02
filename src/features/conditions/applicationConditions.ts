import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applicationConditions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { ConditionLibraryBody } from '@/features/conditions/conditionSchema'
import { getVersion } from '@/features/config/store'
import { hasFullRecordAccess } from '@/features/projects/access'
import { err, ok, type Result } from '@/types/result'

const MIN_REASON_LENGTH = 10

export async function applyCondition(
  db: Db,
  actor: Actor,
  input: { applicationId: string; code: string },
  signal: AbortSignal,
): Promise<Result<{ conditionId: string }, 'forbidden' | 'not_found' | 'unknown_condition'>> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return err('forbidden')
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return err('not_found')
  const library = await getVersion(db, app.pins.conditionLibrary, signal)
  const condition = (library?.body as ConditionLibraryBody | undefined)?.conditions.find(
    (c) => c.code === input.code,
  )
  if (condition === undefined) return err('unknown_condition')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(applicationConditions)
      .values({
        applicationId: input.applicationId,
        code: condition.code,
        textSnapshot: condition.text,
        blocksIssuance: condition.blocksIssuance,
        changedBy: actor.userId,
      })
      .returning({ id: applicationConditions.id })
    const conditionId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'condition.apply',
        entityType: 'application',
        entityId: input.applicationId,
        after: { conditionId, code: condition.code },
      },
      signal,
    )
    return ok({ conditionId })
  })
}

export async function setConditionStatus(
  db: Db,
  actor: Actor,
  input: { conditionId: string; status: 'unmet' | 'met' | 'waived'; reason?: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found' | 'reason_required'>> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return err('forbidden')
  const [row] = await db
    .select()
    .from(applicationConditions)
    .where(eq(applicationConditions.id, input.conditionId))
  if (row === undefined) return err('not_found')
  const reason = input.reason?.trim() ?? ''
  if (input.status === 'waived' && row.blocksIssuance) {
    if (!(await hasCapability(db, actor.userId, 'gate.override_admin', signal)))
      return err('forbidden')
    if (reason.length < MIN_REASON_LENGTH) return err('reason_required')
  }
  return await transactionResult(db, async (tx) => {
    await tx
      .update(applicationConditions)
      .set({
        status: input.status,
        statusReason: reason === '' ? null : reason,
        changedBy: actor.userId,
        changedAt: new Date(),
      })
      .where(eq(applicationConditions.id, input.conditionId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'condition.status',
        entityType: 'application',
        entityId: row.applicationId,
        before: { status: row.status },
        after: { conditionId: input.conditionId, status: input.status, reason },
      },
      signal,
    )
    return ok(undefined)
  })
}
