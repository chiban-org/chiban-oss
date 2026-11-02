import type { ClockRule } from '@packs/nh/schema'
import { and, eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { clockAdjustments, clocks, remediationTasks, ruleTransitionsApplied } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import { type AnyActor, actorLabel, toAuditActor } from '@/features/audit/actorRef'
import { writeAudit } from '@/features/audit/writeAudit'
import { hasCapability } from '@/features/authz/capabilities'
import { computeDue } from '@/features/clocks/computeDue'
import { createClock, resolveClockLength } from '@/features/clocks/startClocks'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface RuleTransition {
  id: string
  ruleKey: string
  fromVersion: number
  toVersion: number
  policy: 'keep_old' | 'switch'
  reason: string
  remediation?: (app: ApplicationContext) => { kind: string; description: string }[]
}

export interface TransitionPreviewRow {
  applicationId: string
  clockId: string
  oldDue: CivilDate
  newDue: CivilDate | null
  remediation: string[]
}

type ClockRow = typeof clocks.$inferSelect

async function affectedClocks(db: DbOrTx, t: RuleTransition): Promise<ClockRow[]> {
  return await db
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.ruleKey, t.ruleKey),
        eq(clocks.ruleVersion, t.fromVersion),
        eq(clocks.status, 'running'),
      ),
    )
}

function clockRuleOf(pack: Pack, key: string, version: number): ClockRule {
  const rule = ruleByKey(pack, key, version)
  if (rule.kind !== 'clock')
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, `${key} is not a clock rule`)
  return rule
}

async function recomputedDue(
  tx: DbOrTx,
  clock: ClockRow,
  rule: ClockRule,
  facts: ApplicationContext['facts'],
  pack: Pack,
  signal: AbortSignal,
): Promise<CivilDate> {
  const length = await resolveClockLength(tx, rule, facts, pack, signal)
  return computeDue({
    start: clock.startDate as CivilDate,
    length: { unit: length.unit, value: length.value },
    direction: rule.direction,
    clockType: rule.clockType,
    holidays: packHolidayCalendar(),
  }).due
}

export async function previewRuleTransition(
  db: Db,
  t: RuleTransition,
  _today: CivilDate,
  signal: AbortSignal,
  pack: Pack = loadPack(),
): Promise<{ affected: TransitionPreviewRow[] }> {
  signal.throwIfAborted()
  const toRule = clockRuleOf(pack, t.ruleKey, t.toVersion)
  const affected: TransitionPreviewRow[] = []
  for (const clock of await affectedClocks(db, t)) {
    const app = await loadApplicationContext(db, clock.applicationId, signal)
    if (app === null) continue
    affected.push({
      applicationId: clock.applicationId,
      clockId: clock.id,
      oldDue: clock.currentDue as CivilDate,
      newDue:
        t.policy === 'switch'
          ? await recomputedDue(db, clock, toRule, app.facts, pack, signal)
          : null,
      remediation: (t.remediation?.(app) ?? []).map((r) => r.description),
    })
  }
  return { affected }
}

export async function applyRuleTransition(
  db: Db,
  actor: AnyActor,
  t: RuleTransition,
  signal: AbortSignal,
  pack: Pack = loadPack(),
): Promise<Result<{ affected: number }, 'already_applied' | 'forbidden'>> {
  signal.throwIfAborted()
  if (actor.kind !== 'system' && !(await hasCapability(db, actor.userId, 'config.edit', signal))) {
    return err('forbidden')
  }
  const toRule = clockRuleOf(pack, t.ruleKey, t.toVersion)
  return await transactionResult<{ affected: number }, 'already_applied' | 'forbidden'>(
    db,
    async (tx) => {
      const claimed = await tx
        .insert(ruleTransitionsApplied)
        .values({ id: t.id, appliedBy: actorLabel(actor), affected: 0 })
        .onConflictDoNothing()
        .returning({ id: ruleTransitionsApplied.id })
      if (claimed.length === 0) return err('already_applied')
      const targets = await affectedClocks(tx, t)
      for (const clock of targets) {
        const app = await loadApplicationContext(tx, clock.applicationId, signal)
        if (app === null) continue
        if (t.policy === 'switch') {
          await switchClock(tx, t, clock, toRule, app, pack, signal)
        }
        const declared = t.remediation?.(app) ?? []
        if (declared.length > 0) {
          await tx
            .insert(remediationTasks)
            .values(declared.map((r) => ({ applicationId: app.id, ...r, transitionId: t.id })))
        }
      }
      await tx
        .update(ruleTransitionsApplied)
        .set({ affected: targets.length })
        .where(eq(ruleTransitionsApplied.id, t.id))
      await writeAudit(
        tx,
        {
          actor: toAuditActor(actor),
          action: 'rules.transition.apply',
          entityType: 'rule_transition',
          entityId: t.id,
          after: { policy: t.policy, reason: t.reason, affected: targets.length },
        },
        signal,
      )
      return ok({ affected: targets.length })
    },
  )
}

async function switchClock(
  tx: Tx,
  t: RuleTransition,
  clock: ClockRow,
  toRule: ClockRule,
  app: ApplicationContext,
  pack: Pack,
  signal: AbortSignal,
): Promise<void> {
  const freshId = await createClock(
    tx,
    {
      applicationId: clock.applicationId,
      rule: toRule,
      facts: app.facts,
      event: clock.startEvent as ClockRule['startEvent'],
      onDate: clock.startDate as CivilDate,
      pack,
    },
    signal,
  )
  await tx
    .update(clocks)
    .set({ status: 'superseded', supersededBy: freshId, supersededReason: `rule_change:${t.id}` })
    .where(eq(clocks.id, clock.id))
  const adjustments = await tx
    .select({ id: clockAdjustments.id })
    .from(clockAdjustments)
    .where(eq(clockAdjustments.clockId, clock.id))
  if (adjustments.length > 0) {
    await tx.insert(remediationTasks).values(
      adjustments.map(() => ({
        applicationId: clock.applicationId,
        kind: 'review_adjustment',
        description: 'Review adjustment after rule change',
        transitionId: t.id,
      })),
    )
  }
}
