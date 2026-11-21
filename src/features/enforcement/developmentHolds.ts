import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, Tx } from '@/db/client'
import {
  applications,
  developmentHolds,
  enforcementCases,
  enforcementCivilActions,
  enforcementFines,
  holdPermitActions,
  violationFindings,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { isSuspended } from '@/features/appeals/suspension'
import { applyTransition } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { lockCase } from '@/features/enforcement/cases'
import { cureStatus } from '@/features/enforcement/cureNotices'
import { cureRuleByKey } from '@/features/enforcement/cureRules'
import { holdsEnabled } from '@/features/enforcement/holdReads'
import { fineDueCents } from '@/features/ledger/fineDue'
import { civilDateSchema } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export { revokePermitUnderHold, suspendPermitUnderHold } from '@/features/enforcement/holdPermits'
export { activeHoldFor, HELD_PARCEL_COPY } from '@/features/enforcement/holdReads'

type Remedy = 'developmentHold' | 'civilAction'
type RemedyError = 'not_found' | 'remedy_not_available' | 'cure_not_lapsed'

async function remedyOpen(
  db: Db,
  input: { caseId: string; remedy: Remedy; on: CivilDate },
  signal: AbortSignal,
): Promise<Result<typeof enforcementCases.$inferSelect, RemedyError | 'no_parcel'>> {
  const { caseId, remedy, on } = input
  const [row] = await db.select().from(enforcementCases).where(eq(enforcementCases.id, caseId))
  if (row === undefined) return err('not_found')
  if (remedy === 'developmentHold' && row.parcelId === null) return err('no_parcel')
  const rule = cureRuleByKey(row.cureRuleKey)
  const offered =
    remedy === 'developmentHold'
      ? rule?.remedies.developmentHold === true && holdsEnabled()
      : rule?.remedies.civilAction === true
  if (!offered) return err('remedy_not_available')
  const status = await cureStatus(db, caseId, on, signal)
  return status.lapsedUncorrected ? ok(row) : err('cure_not_lapsed')
}

export async function placeDevelopmentHold(
  db: Db,
  actor: Actor,
  input: { caseId: string; placedOn: CivilDate },
  signal: AbortSignal,
): Promise<
  Result<
    { holdId: string },
    | 'forbidden'
    | 'not_found'
    | 'no_parcel'
    | 'remedy_not_available'
    | 'cure_not_lapsed'
    | 'already_held'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const open = await remedyOpen(
    db,
    { caseId: input.caseId, remedy: 'developmentHold', on: input.placedOn },
    signal,
  )
  if (!open.ok) return open
  const parcelId = open.value.parcelId ?? ''
  return await transactionResult(db, async (tx) => {
    await lockCase(tx, input.caseId)
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
    .returning({ applicationId: holdPermitActions.applicationId })
  for (const { applicationId } of suspended) {
    const [app] = await tx
      .select({ state: applications.state, rowVersion: applications.rowVersion })
      .from(applications)
      .where(eq(applications.id, applicationId))
    if (app?.state !== 'suspended' || (await isSuspended(tx, applicationId, signal))) continue
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
      throw new AppError(
        ErrorIds.ENF_INVARIANT,
        'A permit suspended under a hold did not reinstate',
        {
          applicationId,
        },
      )
    }
  }
}

export async function releaseDevelopmentHold(
  db: Db,
  actor: Actor,
  input: { holdId: string; releasedOn: CivilDate },
  signal: AbortSignal,
): Promise<
  Result<void, 'forbidden' | 'not_found' | 'already_released' | 'findings_open' | 'balance_due'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const [hold] = await tx
      .select()
      .from(developmentHolds)
      .where(eq(developmentHolds.id, input.holdId))
      .for('update')
    if (hold === undefined) return err('not_found')
    if (hold.releasedOn !== null) return err('already_released')
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

const CivilActionSchema = z.object({
  caseId: z.string().uuid(),
  filedOn: civilDateSchema,
  court: z.string().trim().min(1).max(200),
  docket: z.string().trim().min(1).max(100).nullable(),
})

export async function recordCivilAction(
  db: Db,
  actor: Actor,
  input: { caseId: string; filedOn: CivilDate; court: string; docket: string | null },
  signal: AbortSignal,
): Promise<Result<{ civilActionId: string }, 'forbidden' | 'invalid' | RemedyError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = CivilActionSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  const open = await remedyOpen(
    db,
    { caseId: value.caseId, remedy: 'civilAction', on: value.filedOn },
    signal,
  )
  if (!open.ok) return err(open.error === 'no_parcel' ? 'not_found' : open.error)
  return await transactionResult(db, async (tx) => {
    await lockCase(tx, value.caseId)
    const [row] = await tx
      .insert(enforcementCivilActions)
      .values({
        caseId: value.caseId,
        filedOn: value.filedOn,
        court: value.court,
        docket: value.docket,
        recordedBy: actor.userId,
      })
      .returning({ id: enforcementCivilActions.id })
    const civilActionId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.civil_action_recorded',
        entityType: 'enforcement_case',
        entityId: value.caseId,
        after: { civilActionId, filedOn: value.filedOn, court: value.court },
      },
      signal,
    )
    return ok({ civilActionId })
  })
}
