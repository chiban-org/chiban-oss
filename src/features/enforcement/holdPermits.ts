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
import { appealOpen } from '@/features/appeals/suspension'
import {
  appealStops,
  lastReturnToIssued,
  stopExerciseClocks,
} from '@/features/appeals/suspensionClocks'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
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
  | 'before_reinstatement'
  | 'before_suspension'

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
  suspendable: boolean
}

async function appealAlreadySuspends(db: DbOrTx, app: ApplicationContext, signal: AbortSignal) {
  return appealStops(app) && (await appealOpen(db, app.id, signal))
}

async function suspendableUnderHold(
  db: DbOrTx,
  row: { id: string; state: string },
  actedHere: boolean,
  signal: AbortSignal,
): Promise<boolean> {
  if (row.state === 'issued') return true
  if (actedHere) return false
  const app = await loadApplicationContext(db, row.id, signal)
  return app !== null && (await appealAlreadySuspends(db, app, signal))
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
  const permits: HeldPermit[] = []
  for (const r of rows) {
    const acted = actions.find((a) => a.applicationId === r.id && a.reinstatedOn === null)
    const actedHere = acted?.action === 'suspended'
    permits.push({
      applicationId: r.id,
      number: r.number,
      state: r.state === 'suspended' ? 'suspended' : 'issued',
      action: actedHere ? 'suspended' : null,
      suspendable: await suspendableUnderHold(db, r, actedHere, signal),
    })
  }
  return permits
}

interface Checked {
  rowVersion: number
  move: boolean
}

async function suspendedPermitCheck(
  tx: Tx,
  input: HoldPermitInput,
  app: ApplicationContext,
  revoking: boolean,
  signal: AbortSignal,
): Promise<Result<Checked, Exclude<HoldPermitError, 'forbidden'>>> {
  const [action] = await tx
    .select()
    .from(holdPermitActions)
    .where(
      and(
        eq(holdPermitActions.holdId, input.holdId),
        eq(holdPermitActions.applicationId, app.id),
        eq(holdPermitActions.action, 'suspended'),
      ),
    )
  if (revoking) {
    if (action === undefined) return err('not_issued')
    if (input.actedOn < action.actedOn) return err('before_suspension')
    return ok({ rowVersion: app.rowVersion, move: true })
  }
  const byAppeal = action === undefined && (await appealAlreadySuspends(tx, app, signal))
  return byAppeal ? ok({ rowVersion: app.rowVersion, move: false }) : err('not_issued')
}

async function checkPermit(
  tx: Tx,
  input: HoldPermitInput,
  revoking: boolean,
  signal: AbortSignal,
): Promise<Result<Checked, Exclude<HoldPermitError, 'forbidden'>>> {
  const [hold] = await tx
    .select()
    .from(developmentHolds)
    .where(eq(developmentHolds.id, input.holdId))
    .for('update')
  if (hold === undefined) return err('not_found')
  if (hold.releasedOn !== null) return err('after_released')
  if (input.actedOn < hold.placedOn) return err('before_placed')
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .for('update')
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (!(await applicationParcelIds(tx, app.id)).includes(hold.parcelId)) return err('not_on_parcel')
  const returned = await lastReturnToIssued(tx, app)
  if (returned !== null && input.actedOn < returned) return err('before_reinstatement')
  if (app.state === 'issued') return ok({ rowVersion: app.rowVersion, move: true })
  if (app.state !== 'suspended') return err('not_issued')
  return await suspendedPermitCheck(tx, input, app, revoking, signal)
}

async function movePermit(
  tx: Tx,
  actor: Actor,
  { action, ...input }: HoldPermitInput & { action: 'suspended' | 'revoked' },
  rowVersion: number,
  signal: AbortSignal,
): Promise<Result<void, HoldPermitError>> {
  const moved = await transitionApplication(
    tx,
    actor,
    {
      applicationId: input.applicationId,
      to: action === 'suspended' ? 'suspended' : 'closed',
      expectedRowVersion: rowVersion,
      onDate: input.actedOn,
      holdId: input.holdId,
      ...(action === 'revoked' ? { closureReason: 'revoked_under_hold' as const } : {}),
    },
    signal,
  )
  if (!moved.ok) return err(moved.error === 'forbidden' ? 'forbidden' : 'not_issued')
  if (action === 'suspended') await stopExerciseClocks(tx, input.applicationId)
  return ok(undefined)
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
    if (checked.value.move) {
      const moved = await movePermit(
        tx,
        actor,
        { ...input, action },
        checked.value.rowVersion,
        signal,
      )
      if (!moved.ok) return moved
    }
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
