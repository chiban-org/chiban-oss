import { and, eq, isNull } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { appeals, applications } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { appealOpen, appealSuspends } from '@/features/appeals/suspension'
import {
  lastReturnToIssued,
  stopExerciseClocks,
  stoppedSince,
  tollStoppedClocks,
} from '@/features/appeals/suspensionClocks'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import { lockApplication } from '@/features/applications/lockApplication'
import { applyTransition } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { effectiveBindings } from '@/features/config/bindings'
import { holdActedOnOrAfter, holdSuspends, holdsEnabled } from '@/features/enforcement/holdReads'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'
import { isAfterTownToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

type AppealInput = { applicationId: string; filedOn: CivilDate; appellantName: string }
type AppealOptions = { pack?: Pack; now?: Date }

export async function recordAppeal(
  db: Db,
  actor: Actor,
  input: AppealInput,
  signal: AbortSignal,
  { pack = loadPack(), now = new Date() }: AppealOptions = {},
): Promise<Result<void, 'forbidden' | FilingError | 'future_date'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'permit.issue', signal))) return err('forbidden')
  if (await isAfterTownToday(db, input.filedOn, now, signal)) return err('future_date')
  return await transactionResult(db, (tx) =>
    recordAppealAuthorizedByCaller(tx, actor, input, signal, pack),
  )
}

type FilingError = 'not_issued' | 'before_reinstatement'

export async function acceptsIssuanceAppeal(
  tx: Tx,
  app: Pick<ApplicationContext, 'id' | 'state'>,
  signal: AbortSignal,
): Promise<boolean> {
  if (app.state === 'issued') return true
  return (
    app.state === 'suspended' &&
    (await holdSuspends(tx, app.id, signal)) &&
    !(await appealOpen(tx, app.id, signal))
  )
}

async function filingTarget(
  tx: Tx,
  input: AppealInput,
  signal: AbortSignal,
): Promise<Result<{ app: ApplicationContext; held: boolean }, FilingError>> {
  const holds = holdsEnabled()
  if (holds) {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
  }
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_issued')
  if (!(await acceptsIssuanceAppeal(tx, app, signal))) return err('not_issued')
  const held = app.state === 'suspended'
  const returned = holds ? await lastReturnToIssued(tx, app) : null
  if (returned !== null && input.filedOn < returned) return err('before_reinstatement')
  return ok({ app, held })
}

export async function recordAppealAuthorizedByCaller(
  tx: Tx,
  actor: Actor,
  input: AppealInput,
  signal: AbortSignal,
  pack: Pack = loadPack(),
): Promise<Result<void, FilingError>> {
  signal.throwIfAborted()
  const target = await filingTarget(tx, input, signal)
  if (!target.ok) return target
  const { app, held } = target.value
  const suspends = appealSuspends(pack, new Set(effectiveBindings(app.typeBody, pack)))
  if (suspends && !held) {
    const moved = await applyTransition(
      tx,
      actor,
      {
        applicationId: input.applicationId,
        to: 'suspended',
        expectedRowVersion: app.rowVersion,
        onDate: input.filedOn,
      },
      signal,
    )
    if (!moved.ok) return err('not_issued')
  }
  await tx.insert(appeals).values({
    applicationId: input.applicationId,
    kind: 'appeal_of_issuance',
    filedOn: input.filedOn,
    appellantName: input.appellantName,
    recordedBy: actor.userId,
  })
  if (suspends && !held) await stopExerciseClocks(tx, input.applicationId)
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'appeal.record',
      entityType: 'application',
      entityId: input.applicationId,
      after: { filedOn: input.filedOn, appellantName: input.appellantName },
    },
    signal,
  )
  return ok(undefined)
}

type ResolveError =
  | 'forbidden'
  | 'no_open_appeal'
  | 'before_filing'
  | 'not_suspended'
  | 'future_date'
  | 'before_hold'

export async function resolveAppeal(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    resolvedOn: CivilDate
    outcome: 'permit_upheld' | 'permit_revoked'
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, ResolveError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'permit.issue', signal))) return err('forbidden')
  if (await isAfterTownToday(db, input.resolvedOn, now, signal)) return err('future_date')
  return await transactionResult<void, ResolveError>(db, async (tx) => {
    if (holdsEnabled()) await lockApplication(tx, input.applicationId)
    const [open] = await tx
      .select()
      .from(appeals)
      .where(and(eq(appeals.applicationId, input.applicationId), isNull(appeals.resolvedOn)))
    if (open === undefined) return err('no_open_appeal')
    if (input.resolvedOn < open.filedOn) return err('before_filing')
    if (await holdActedOnOrAfter(tx, input.applicationId, input.resolvedOn, signal)) {
      return err('before_hold')
    }
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_suspended')
    await tx
      .update(appeals)
      .set({ resolvedOn: input.resolvedOn, outcome: input.outcome, resolvedBy: actor.userId })
      .where(eq(appeals.id, open.id))
    if (app.state !== 'suspended') return ok(undefined)
    const to = input.outcome === 'permit_upheld' ? 'issued' : 'closed'
    const held = to === 'issued' && (await holdSuspends(tx, app.id, signal))
    if (!held) {
      const moved = await applyTransition(
        tx,
        actor,
        {
          applicationId: input.applicationId,
          to,
          expectedRowVersion: app.rowVersion,
          onDate: input.resolvedOn,
          ...(to === 'closed' ? { closureReason: 'revoked_on_appeal' as const } : {}),
        },
        signal,
      )
      if (!moved.ok) return err('not_suspended')
    }
    if (input.outcome !== 'permit_revoked' && !held) {
      const from = await stoppedSince(tx, app, open.filedOn as CivilDate)
      await tollStoppedClocks(
        tx,
        actor,
        { applicationId: input.applicationId, from, to: input.resolvedOn },
        signal,
      )
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'appeal.resolve',
        entityType: 'application',
        entityId: input.applicationId,
        after: { outcome: input.outcome, resolvedOn: input.resolvedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}
