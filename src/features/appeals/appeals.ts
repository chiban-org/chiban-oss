import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { appeals, applications, clocks } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { applyTransition } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { recordAdjustment } from '@/features/clocks/adjustClock'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { addDays, type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const SUSPENSION_REASON_RULE_KEY = 'nh.appeal.suspension'

async function exerciseByClocks(tx: Tx, applicationId: string, status: 'running' | 'stopped') {
  const rows = await tx
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.status, status)))
    .orderBy(desc(clocks.createdAt))
  const pack = loadPack()
  return rows.filter((c) => {
    const rule = ruleByKey(pack, c.ruleKey, c.ruleVersion)
    return rule.kind === 'clock' && rule.clockType === 'exercise_by'
  })
}

export async function recordAppeal(
  db: Db,
  actor: Actor,
  input: { applicationId: string; filedOn: CivilDate; appellantName: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_issued'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'permit.issue', signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app?.state !== 'issued') return err('not_issued')
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
    await tx.insert(appeals).values({
      applicationId: input.applicationId,
      kind: 'appeal_of_issuance',
      filedOn: input.filedOn,
      appellantName: input.appellantName,
      recordedBy: actor.userId,
    })
    for (const clock of await exerciseByClocks(tx, input.applicationId, 'running')) {
      await tx.update(clocks).set({ status: 'stopped' }).where(eq(clocks.id, clock.id))
    }
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
  })
}

type ResolveError = 'forbidden' | 'no_open_appeal' | 'before_filing' | 'not_suspended'

export async function resolveAppeal(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    resolvedOn: CivilDate
    outcome: 'permit_upheld' | 'permit_revoked'
  },
  signal: AbortSignal,
): Promise<Result<void, ResolveError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'permit.issue', signal))) return err('forbidden')
  return await transactionResult<void, ResolveError>(db, async (tx) => {
    const [open] = await tx
      .select()
      .from(appeals)
      .where(and(eq(appeals.applicationId, input.applicationId), isNull(appeals.resolvedOn)))
    if (open === undefined) return err('no_open_appeal')
    if (input.resolvedOn < open.filedOn) return err('before_filing')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app?.state !== 'suspended') return err('not_suspended')
    await tx
      .update(appeals)
      .set({ resolvedOn: input.resolvedOn, outcome: input.outcome, resolvedBy: actor.userId })
      .where(eq(appeals.id, open.id))
    const to = input.outcome === 'permit_upheld' ? 'issued' : 'closed'
    const moved = await applyTransition(
      tx,
      actor,
      {
        applicationId: input.applicationId,
        to,
        expectedRowVersion: app.rowVersion,
        onDate: input.resolvedOn,
      },
      signal,
    )
    if (!moved.ok) return err('not_suspended')
    if (input.outcome === 'permit_revoked') {
      await tx
        .update(applications)
        .set({ closureReason: 'revoked_on_appeal' })
        .where(eq(applications.id, input.applicationId))
    } else {
      await tollStoppedClocks(
        tx,
        actor,
        input.applicationId,
        open.filedOn as CivilDate,
        input.resolvedOn,
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

async function tollStoppedClocks(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  filedOn: CivilDate,
  resolvedOn: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  const label = ruleByKey(loadPack(), SUSPENSION_REASON_RULE_KEY).label
  const days = daysBetween(filedOn, resolvedOn)
  for (const clock of await exerciseByClocks(tx, applicationId, 'stopped')) {
    await tx.update(clocks).set({ status: 'running' }).where(eq(clocks.id, clock.id))
    await recordAdjustment(
      tx,
      actor,
      clock,
      {
        kind: 'tolling',
        days,
        newDue: addDays(clock.currentDue as CivilDate, days),
        reason: label,
      },
      signal,
    )
  }
}
