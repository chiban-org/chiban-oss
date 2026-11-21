import { and, eq, gt, isNull } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, Tx } from '@/db/client'
import {
  developmentHolds,
  enforcementFines,
  holdPermitActions,
  violationFindings,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { appealOpen } from '@/features/appeals/suspension'
import { appealStops, stoppedSince, tollStoppedClocks } from '@/features/appeals/suspensionClocks'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import { lockApplication } from '@/features/applications/lockApplication'
import { applyTransition } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { lockCase } from '@/features/enforcement/cases'
import { lockedRemedyOpen, type RemedyError } from '@/features/enforcement/civilActions'
import { holdSuspends } from '@/features/enforcement/holdReads'
import { fineDueCents } from '@/features/ledger/fineDue'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export { recordCivilAction } from '@/features/enforcement/civilActions'
export { revokePermitUnderHold, suspendPermitUnderHold } from '@/features/enforcement/holdPermits'
export { activeHoldFor, HELD_PARCEL_COPY } from '@/features/enforcement/holdReads'

type PlaceError = 'forbidden' | 'no_parcel' | RemedyError | 'already_held'

export async function placeDevelopmentHold(
  db: Db,
  actor: Actor,
  input: { caseId: string; placedOn: CivilDate },
  signal: AbortSignal,
): Promise<Result<{ holdId: string }, PlaceError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult<{ holdId: string }, PlaceError>(db, async (tx) => {
    const open = await lockedRemedyOpen(
      tx,
      { caseId: input.caseId, remedy: 'developmentHold', on: input.placedOn },
      signal,
    )
    if (!open.ok) return open
    const parcelId = open.value.parcelId ?? ''
    const [placed] = await tx
      .insert(developmentHolds)
      .values({
        parcelId,
        caseId: input.caseId,
        placedOn: input.placedOn,
        placedBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ id: developmentHolds.id })
    if (placed === undefined) return err('already_held')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.hold_placed',
        entityType: 'enforcement_case',
        entityId: input.caseId,
        after: { holdId: placed.id, parcelId, placedOn: input.placedOn },
      },
      signal,
    )
    return ok({ holdId: placed.id })
  })
}

async function lockHoldWithCase(tx: Tx, holdId: string) {
  const [unlocked] = await tx
    .select({ caseId: developmentHolds.caseId })
    .from(developmentHolds)
    .where(eq(developmentHolds.id, holdId))
  if (unlocked === undefined) return undefined
  await lockCase(tx, unlocked.caseId)
  const [hold] = await tx
    .select()
    .from(developmentHolds)
    .where(eq(developmentHolds.id, holdId))
    .for('update')
  return hold
}

async function balanceDue(tx: Tx, caseId: string): Promise<boolean> {
  const fines = await tx
    .select({ id: enforcementFines.id })
    .from(enforcementFines)
    .where(eq(enforcementFines.caseId, caseId))
  for (const fine of fines) {
    if ((await fineDueCents(tx, fine.id)) > 0) return true
  }
  return false
}

async function suspendedAfter(tx: Tx, holdId: string, releasedOn: CivilDate): Promise<boolean> {
  const later = await tx
    .select({ actedOn: holdPermitActions.actedOn })
    .from(holdPermitActions)
    .where(
      and(
        eq(holdPermitActions.holdId, holdId),
        eq(holdPermitActions.action, 'suspended'),
        isNull(holdPermitActions.reinstatedOn),
        gt(holdPermitActions.actedOn, releasedOn),
      ),
    )
    .limit(1)
  return later.length > 0
}

async function stillSuspended(tx: Tx, app: ApplicationContext, signal: AbortSignal) {
  if (await holdSuspends(tx, app.id, signal)) return true
  return appealStops(app) && (await appealOpen(tx, app.id, signal))
}

async function reinstatePermits(
  tx: Tx,
  actor: Actor,
  release: { holdId: string; releasedOn: CivilDate },
  signal: AbortSignal,
): Promise<void> {
  const { holdId, releasedOn } = release
  const suspended = await tx
    .update(holdPermitActions)
    .set({ reinstatedOn: releasedOn })
    .where(
      and(
        eq(holdPermitActions.holdId, holdId),
        eq(holdPermitActions.action, 'suspended'),
        isNull(holdPermitActions.reinstatedOn),
      ),
    )
    .returning({
      applicationId: holdPermitActions.applicationId,
      actedOn: holdPermitActions.actedOn,
    })
  for (const { applicationId, actedOn } of suspended) {
    await lockApplication(tx, applicationId)
    const app = await loadApplicationContext(tx, applicationId, signal)
    if (app?.state !== 'suspended' || (await stillSuspended(tx, app, signal))) continue
    const moved = await applyTransition(
      tx,
      actor,
      {
        applicationId,
        to: 'issued',
        expectedRowVersion: app.rowVersion,
        onDate: releasedOn,
        holdId,
      },
      signal,
    )
    if (!moved.ok) {
      throw new AppError(ErrorIds.ENF_INVARIANT, 'A held permit did not reinstate', {
        applicationId,
      })
    }
    const from = await stoppedSince(tx, app, actedOn as CivilDate)
    await tollStoppedClocks(tx, actor, { applicationId, from, to: releasedOn }, signal)
  }
}

export async function releaseDevelopmentHold(
  db: Db,
  actor: Actor,
  input: { holdId: string; releasedOn: CivilDate },
  signal: AbortSignal,
): Promise<
  Result<
    void,
    | 'forbidden'
    | 'not_found'
    | 'already_released'
    | 'before_placed'
    | 'before_suspension'
    | 'findings_open'
    | 'balance_due'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const hold = await lockHoldWithCase(tx, input.holdId)
    if (hold === undefined) return err('not_found')
    if (hold.releasedOn !== null) return err('already_released')
    if (input.releasedOn < hold.placedOn) return err('before_placed')
    if (await suspendedAfter(tx, hold.id, input.releasedOn)) return err('before_suspension')
    const open = await tx
      .select({ id: violationFindings.id })
      .from(violationFindings)
      .where(and(eq(violationFindings.caseId, hold.caseId), eq(violationFindings.status, 'open')))
      .limit(1)
    if (open.length > 0) return err('findings_open')
    if (await balanceDue(tx, hold.caseId)) return err('balance_due')
    await tx
      .update(developmentHolds)
      .set({ releasedOn: input.releasedOn, releasedBy: actor.userId })
      .where(eq(developmentHolds.id, hold.id))
    await reinstatePermits(tx, actor, { holdId: hold.id, releasedOn: input.releasedOn }, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.hold_released',
        entityType: 'enforcement_case',
        entityId: hold.caseId,
        after: { holdId: hold.id, releasedOn: input.releasedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}
