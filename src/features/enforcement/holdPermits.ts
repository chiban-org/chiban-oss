import { and, eq, inArray, or } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import {
  applicationParcels,
  applications,
  developmentHolds,
  holdPermitActions,
  projects,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { stopExerciseClocks } from '@/features/appeals/suspensionClocks'
import { loadApplicationContext } from '@/features/applications/context'
import { transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { applicationParcelIds } from '@/features/enforcement/holdReads'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type HoldPermitError =
  | 'forbidden'
  | 'not_found'
  | 'after_released'
  | 'not_on_parcel'
  | 'not_issued'
  | 'before_placed'

interface HoldPermitInput {
  holdId: string
  applicationId: string
  actedOn: CivilDate
}

export interface HeldPermit {
  applicationId: string
  number: string
  state: 'issued' | 'suspended'
  action: 'suspended' | null
}

export async function permitsOnHeldParcel(
  db: DbOrTx,
  hold: { holdId: string; parcelId: string },
  signal: AbortSignal,
): Promise<HeldPermit[]> {
  signal.throwIfAborted()
  const extra = db
    .select({ id: applicationParcels.applicationId })
    .from(applicationParcels)
    .where(eq(applicationParcels.parcelId, hold.parcelId))
  const rows = await db
    .select({ id: applications.id, number: applications.number, state: applications.state })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(
      and(
        inArray(applications.state, ['issued', 'suspended']),
        or(eq(projects.parcelId, hold.parcelId), inArray(applications.id, extra)),
      ),
    )
    .orderBy(applications.number)
  const actions = await db
    .select()
    .from(holdPermitActions)
    .where(eq(holdPermitActions.holdId, hold.holdId))
  return rows.map((r) => {
    const acted = actions.find((a) => a.applicationId === r.id && a.reinstatedOn === null)
    return {
      applicationId: r.id,
      number: r.number,
      state: r.state === 'suspended' ? 'suspended' : 'issued',
      action: acted?.action === 'suspended' ? 'suspended' : null,
    }
  })
}

async function checkPermit(
  tx: Tx,
  input: HoldPermitInput,
  allowSuspended: boolean,
  signal: AbortSignal,
): Promise<Result<{ rowVersion: number }, Exclude<HoldPermitError, 'forbidden'>>> {
  const [hold] = await tx
    .select()
    .from(developmentHolds)
    .where(eq(developmentHolds.id, input.holdId))
    .for('update')
  if (hold === undefined) return err('not_found')
  if (hold.releasedOn !== null) return err('after_released')
  if (input.actedOn < hold.placedOn) return err('before_placed')
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (!(await applicationParcelIds(tx, app.id)).includes(hold.parcelId)) return err('not_on_parcel')
  if (app.state === 'issued') return ok({ rowVersion: app.rowVersion })
  if (!allowSuspended || app.state !== 'suspended') return err('not_issued')
  const [action] = await tx
    .select()
    .from(holdPermitActions)
    .where(
      and(
        eq(holdPermitActions.holdId, hold.id),
        eq(holdPermitActions.applicationId, app.id),
        eq(holdPermitActions.action, 'suspended'),
      ),
    )
  return action === undefined ? err('not_issued') : ok({ rowVersion: app.rowVersion })
}

async function actUnderHold(
  db: Db,
  actor: Actor,
  { action, ...input }: HoldPermitInput & { action: 'suspended' | 'revoked' },
  signal: AbortSignal,
): Promise<Result<void, HoldPermitError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult<void, HoldPermitError>(db, async (tx) => {
    const checked = await checkPermit(tx, input, action === 'revoked', signal)
    if (!checked.ok) return checked
    const moved = await transitionApplication(
      tx,
      actor,
      {
        applicationId: input.applicationId,
        to: action === 'suspended' ? 'suspended' : 'closed',
        expectedRowVersion: checked.value.rowVersion,
        onDate: input.actedOn,
        holdId: input.holdId,
        ...(action === 'revoked' ? { closureReason: 'revoked_under_hold' as const } : {}),
      },
      signal,
    )
    if (!moved.ok) return err(moved.error === 'forbidden' ? 'forbidden' : 'not_issued')
    if (action === 'suspended') await stopExerciseClocks(tx, input.applicationId)
    const row = { action, actedOn: input.actedOn, actedBy: actor.userId, reinstatedOn: null }
    await tx
      .insert(holdPermitActions)
      .values({ holdId: input.holdId, applicationId: input.applicationId, ...row })
      .onConflictDoUpdate({
        target: [holdPermitActions.holdId, holdPermitActions.applicationId],
        set: row,
      })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: action === 'suspended' ? 'application.hold_suspended' : 'application.hold_revoked',
        entityType: 'application',
        entityId: input.applicationId,
        after: { holdId: input.holdId, actedOn: input.actedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function suspendPermitUnderHold(
  db: Db,
  actor: Actor,
  input: HoldPermitInput,
  signal: AbortSignal,
): Promise<Result<void, HoldPermitError>> {
  return await actUnderHold(db, actor, { ...input, action: 'suspended' }, signal)
}

export async function revokePermitUnderHold(
  db: Db,
  actor: Actor,
  input: HoldPermitInput,
  signal: AbortSignal,
): Promise<Result<void, HoldPermitError>> {
  return await actUnderHold(db, actor, { ...input, action: 'revoked' }, signal)
}
