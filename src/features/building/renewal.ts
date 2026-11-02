import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { clocks } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { recordAdjustment } from '@/features/clocks/adjustClock'
import { resolveClockLength } from '@/features/clocks/startClocks'
import { assessFees } from '@/features/fees/assess'
import { feeBalance } from '@/features/ledger/feeBalance'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { addMonthsClamped, type CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const EXPIRATION_RULE_KEY = 'town.bp.expiration'
const RENEWAL_REASON = 'Permit renewed'

export async function renewPermit(
  db: Db,
  actor: Actor,
  input: { applicationId: string; renewedOn: CivilDate },
  signal: AbortSignal,
): Promise<
  Result<
    { newDue: CivilDate },
    'forbidden' | 'not_issued' | 'already_lapsed' | 'fees_incomplete' | 'renewal_fee_due'
  >
> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'permit.issue', signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app?.state !== 'issued') return err('not_issued')
    const [clock] = await tx
      .select()
      .from(clocks)
      .where(
        and(
          eq(clocks.applicationId, input.applicationId),
          eq(clocks.ruleKey, EXPIRATION_RULE_KEY),
          eq(clocks.status, 'running'),
        ),
      )
      .orderBy(desc(clocks.createdAt))
      .limit(1)
    if (clock === undefined) return err('not_issued')
    if (input.renewedOn > clock.currentDue) return err('already_lapsed')
    const balance = await feeBalance(tx, input.applicationId, signal)
    if (balance.lines.some((l) => l.stage === 'at_renewal' && l.dueCents > 0)) {
      return err('renewal_fee_due')
    }
    const pack = loadPack()
    const rule = ruleByKey(pack, clock.ruleKey, clock.ruleVersion)
    if (rule.kind !== 'clock') return err('not_issued')
    const validity = await resolveClockLength(tx, rule, app.facts, pack, signal)
    const newDue = addMonthsClamped(input.renewedOn, validity.value)
    await recordAdjustment(
      tx,
      actor,
      clock,
      { kind: 'renewal', days: null, newDue, reason: RENEWAL_REASON },
      signal,
    )
    const assessed = await assessFees(tx, input.applicationId, 'at_renewal', actor, signal)
    if (!assessed.ok) return err('fees_incomplete')
    return ok({ newDue })
  })
}
