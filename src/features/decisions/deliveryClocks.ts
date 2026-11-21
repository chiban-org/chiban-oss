import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { clocks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { clockStartedOn, createClock } from '@/features/clocks/startClocks'
import { effectiveBindings } from '@/features/config/bindings'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { DecisionOutcome } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

export async function markDeliveryClockMetForSource(
  tx: Tx,
  applicationId: string,
  dueRuleKey: string,
  sourceDate: CivilDate,
  metOn: CivilDate,
): Promise<void> {
  const [clock] = await tx
    .select({ id: clocks.id })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, dueRuleKey),
        eq(clocks.startDate, sourceDate),
        inArray(clocks.status, ['running', 'overdue']),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  if (clock === undefined) return
  await tx.update(clocks).set({ status: 'met', metOn }).where(eq(clocks.id, clock.id))
}

export async function startDeliveryClock(
  tx: Tx,
  input: {
    applicationId: string
    dueRuleKey: string
    onDate: CivilDate
    outcome: DecisionOutcome
  },
  signal: AbortSignal,
): Promise<void> {
  const pack = loadPack()
  const rule = ruleByKey(pack, input.dueRuleKey)
  if (rule.kind !== 'clock') return
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return
  if (!effectiveBindings(app.typeBody, pack).includes(rule.key)) return
  if (await clockStartedOn(tx, input.applicationId, rule.key, input.onDate)) return
  const facts = {
    ...(await factsWithDeterminations(tx, input.applicationId, app.facts)),
    outcome: input.outcome,
  }
  await createClock(
    tx,
    {
      applicationId: input.applicationId,
      rule,
      facts,
      event: 'board_vote',
      onDate: input.onDate,
      pack,
    },
    signal,
  )
}
