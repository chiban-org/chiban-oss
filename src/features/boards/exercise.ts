import { and, desc, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { clocks, relianceLinks } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { lockApplication } from '@/features/applications/lockApplication'
import { type AnyActor, toAuditActor } from '@/features/audit/actorRef'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { recordAdjustment } from '@/features/clocks/adjustClock'
import { relianceFloorDue } from '@/features/clocks/relianceFloor'
import { startClocksFor } from '@/features/clocks/startClocks'
import { effectiveBindings } from '@/features/config/bindings'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const EXERCISE_KEY = 'nh.zba.exercise'
const FLOOR_AUTHORITY = 'RSA 674:33 I-a(a) and IV(b)'

export async function runningExerciseClock(tx: Tx, applicationId: string) {
  const [clock] = await tx
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, EXERCISE_KEY),
        eq(clocks.status, 'running'),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  return clock ?? null
}

export async function recordFinalApproval(
  tx: Tx,
  actor: AnyActor,
  input: { applicationId: string; finalOn: CivilDate },
  signal: AbortSignal,
): Promise<Result<{ dueOn: CivilDate }, 'forbidden' | 'not_decided' | 'not_bound'>> {
  signal.throwIfAborted()
  if (actor.kind !== 'system' && !(await hasCapability(tx, actor.userId, 'board.record', signal))) {
    return err('forbidden')
  }
  await lockApplication(tx, input.applicationId)
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null || (app.state !== 'decided' && app.state !== 'issued')) return err('not_decided')
  if (!effectiveBindings(app.typeBody, loadPack()).includes(EXERCISE_KEY)) return err('not_bound')
  await startClocksFor(tx, input.applicationId, 'final_approval', input.finalOn, signal)
  const clock = await runningExerciseClock(tx, input.applicationId)
  if (clock === null) return err('not_bound')
  await writeAudit(
    tx,
    {
      actor: toAuditActor(actor),
      action: 'board.final_approval.record',
      entityType: 'application',
      entityId: input.applicationId,
      after: { finalOn: input.finalOn, dueOn: clock.currentDue },
    },
    signal,
  )
  return ok({ dueOn: clock.currentDue as CivilDate })
}

export async function linkReliance(
  db: Db,
  actor: Actor,
  input: { varianceApplicationId: string; planningApplicationId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    await tx.insert(relianceLinks).values(input).onConflictDoNothing()
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.reliance.link',
        entityType: 'application',
        entityId: input.varianceApplicationId,
        after: { planningApplicationId: input.planningApplicationId },
      },
      signal,
    )
    return ok(undefined)
  })
}

export type RelianceError = 'forbidden' | 'not_linked'
type RelianceInput = {
  varianceApplicationId: string
  planningApplicationId: string
  resolvedOn: CivilDate
}

export async function recordRelianceResolutionTx(
  tx: Tx,
  actor: Actor,
  input: RelianceInput,
  signal: AbortSignal,
): Promise<Result<{ dueOn: CivilDate | null }, RelianceError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(tx, actor.userId, 'board.record', signal))) return err('forbidden')
  await lockApplication(tx, input.varianceApplicationId)
  const updated = await tx
    .update(relianceLinks)
    .set({ resolvedOn: input.resolvedOn })
    .where(
      and(
        eq(relianceLinks.varianceApplicationId, input.varianceApplicationId),
        eq(relianceLinks.planningApplicationId, input.planningApplicationId),
      ),
    )
    .returning({ id: relianceLinks.varianceApplicationId })
  if (updated.length === 0) return err('not_linked')
  const clock = await runningExerciseClock(tx, input.varianceApplicationId)
  if (clock === null) return ok({ dueOn: null })
  const rule = ruleByKey(loadPack(), clock.ruleKey, clock.ruleVersion)
  const floor = rule.kind === 'clock' ? relianceFloorDue(rule, input.resolvedOn) : null
  const current = clock.currentDue as CivilDate
  if (floor === null || compareCivil(floor, current) <= 0) return ok({ dueOn: current })
  await recordAdjustment(
    tx,
    actor,
    clock,
    {
      kind: 'statutory_floor',
      days: null,
      newDue: floor,
      reason: `The approval does not expire within 6 months after the planning application filed in reliance on it is resolved (${FLOOR_AUTHORITY}).`,
      legalAuthority: {
        citation: FLOOR_AUTHORITY,
        explanation: 'Six month minimum after resolution of the reliance application',
      },
    },
    signal,
  )
  return ok({ dueOn: floor })
}

export async function recordRelianceResolution(
  db: Db,
  actor: Actor,
  input: RelianceInput,
  signal: AbortSignal,
): Promise<Result<{ dueOn: CivilDate | null }, RelianceError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<{ dueOn: CivilDate | null }, RelianceError>(db, (tx) =>
    recordRelianceResolutionTx(tx, actor, input, signal),
  )
}
