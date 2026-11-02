import { and, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { clockAdjustments, clocks, regionalImpactParties } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { flagIssuedListStale } from '@/features/abutters/staleList'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { getRegionalContacts } from '@/features/boards/regionalContacts'
import {
  type Determination,
  recordRegionalImpactDetermination,
} from '@/features/building/regionalImpact'
import { factsWithDeterminations } from '@/features/clocks/derivedFacts'
import { createClock } from '@/features/clocks/startClocks'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import { addDays, type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const REGIONAL_IMPACT_DETERMINED = 'regional_impact_determined'
const DECISION_KEY = 'nh.pb.decision'

export type BoardRegionalImpactError =
  | 'forbidden'
  | 'not_found'
  | 'not_board'
  | 'municipality_required'
  | 'unknown_municipality'
  | 'board_ref_required'

async function recomputeDecisionClock(tx: Tx, applicationId: string, signal: AbortSignal) {
  const [running] = await tx
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, DECISION_KEY),
        inArray(clocks.status, ['running', 'overdue']),
      ),
    )
  if (running === undefined) return
  const app = await loadApplicationContext(tx, applicationId, signal)
  if (app === null) return
  const rule = ruleByKey(loadPack(), DECISION_KEY, running.ruleVersion)
  if (rule.kind !== 'clock') return
  const facts = await factsWithDeterminations(tx, applicationId, app.facts)
  const freshId = await createClock(
    tx,
    {
      applicationId,
      rule,
      facts,
      event: running.startEvent as typeof rule.startEvent,
      onDate: running.startDate as CivilDate,
      pack: loadPack(),
    },
    signal,
  )
  const [fresh] = await tx.select().from(clocks).where(eq(clocks.id, freshId))
  if (fresh?.computedDue === running.computedDue) {
    await tx.delete(clocks).where(eq(clocks.id, freshId))
    return
  }
  await tx
    .update(clocks)
    .set({
      status: 'superseded',
      supersededBy: freshId,
      supersededReason: REGIONAL_IMPACT_DETERMINED,
    })
    .where(eq(clocks.id, running.id))
  if (fresh !== undefined && running.currentDue !== running.computedDue) {
    await tx
      .update(clockAdjustments)
      .set({ clockId: freshId })
      .where(eq(clockAdjustments.clockId, running.id))
    const shift = daysBetween(running.computedDue as CivilDate, fresh.computedDue as CivilDate)
    await tx
      .update(clocks)
      .set({ currentDue: addDays(running.currentDue as CivilDate, shift) })
      .where(eq(clocks.id, freshId))
  }
}

export async function recordBoardRegionalImpact(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    determination: Determination
    municipalityKeys: string[]
    previousBoardRef?: string
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, BoardRegionalImpactError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'regional_impact.determine', signal))) {
    return err('forbidden')
  }
  const keys = [...new Set(input.municipalityKeys)]
  if (input.determination === 'yes' && keys.length === 0) return err('municipality_required')
  return await transactionResult<void, BoardRegionalImpactError>(db, async (tx) => {
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    if (boardOfApplication(app) === null) return err('not_board')
    const contacts = await getRegionalContacts(tx, signal)
    const known = new Set(contacts.municipalities.map((m) => m.key))
    if (input.determination === 'yes' && keys.some((k) => !known.has(k))) {
      return err('unknown_municipality')
    }
    const determinedOn = await townToday(tx, now, signal)
    const recorded = await recordRegionalImpactDetermination(
      tx,
      actor,
      {
        applicationId: input.applicationId,
        determination: input.determination,
        previousBoardRef: input.previousBoardRef,
        determinedOn,
      },
      signal,
    )
    if (!recorded.ok) return err(recorded.error)
    await tx
      .delete(regionalImpactParties)
      .where(eq(regionalImpactParties.applicationId, input.applicationId))
    if (input.determination === 'yes') {
      await tx
        .insert(regionalImpactParties)
        .values(
          keys.map((municipalityKey) => ({ applicationId: input.applicationId, municipalityKey })),
        )
    }
    await recomputeDecisionClock(tx, input.applicationId, signal)
    await flagIssuedListStale(tx, input.applicationId, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.regional_impact.record',
        entityType: 'application',
        entityId: input.applicationId,
        after: { determination: input.determination, municipalityKeys: keys },
      },
      signal,
    )
    return ok(undefined)
  })
}
