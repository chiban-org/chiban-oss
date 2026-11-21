import { asc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { developmentHolds, enforcementCivilActions } from '@/db/schema'
import {
  type CasePlanCure,
  cureRuleByKey,
  packHasCureRules,
} from '@/features/enforcement/cureRules'
import { type HeldPermit, permitsOnHeldParcel } from '@/features/enforcement/holdPermits'
import { holdsEnabled } from '@/features/enforcement/holdReads'

export interface RemedyFacts {
  holdPlaced: boolean
  civilActionFiled: boolean
}

export interface CaseRemedies {
  holdOffered: boolean
  civilOffered: boolean
  holds: (typeof developmentHolds.$inferSelect)[]
  permits: HeldPermit[]
  civilActions: (typeof enforcementCivilActions.$inferSelect)[]
}

export const NO_REMEDIES: CaseRemedies = {
  holdOffered: false,
  civilOffered: false,
  holds: [],
  permits: [],
  civilActions: [],
}

export function factsOf(remedies: CaseRemedies): RemedyFacts {
  return {
    holdPlaced: remedies.holds.some((h) => h.releasedOn === null),
    civilActionFiled: remedies.civilActions.length > 0,
  }
}

export function withRemedyFacts(
  cure: CasePlanCure | null,
  facts: RemedyFacts | undefined,
): CasePlanCure | null {
  return cure === null || facts === undefined ? cure : { ...cure, ...facts }
}

export async function loadCaseRemedies(
  db: DbOrTx,
  row: { id: string; parcelId: string | null; cureRuleKey: string | null },
  signal: AbortSignal,
): Promise<CaseRemedies> {
  signal.throwIfAborted()
  const rule = cureRuleByKey(row.cureRuleKey)
  if (rule === null) return NO_REMEDIES
  const holdOffered = rule.remedies.developmentHold && holdsEnabled() && row.parcelId !== null
  const civilOffered = rule.remedies.civilAction
  if (!holdOffered && !civilOffered) return NO_REMEDIES
  const [holds, civilActions] = await Promise.all([
    holdOffered
      ? db
          .select()
          .from(developmentHolds)
          .where(eq(developmentHolds.caseId, row.id))
          .orderBy(asc(developmentHolds.placedOn))
      : [],
    civilOffered
      ? db
          .select()
          .from(enforcementCivilActions)
          .where(eq(enforcementCivilActions.caseId, row.id))
          .orderBy(asc(enforcementCivilActions.filedOn))
      : [],
  ])
  const active = holds.find((h) => h.releasedOn === null)
  const permits =
    active === undefined
      ? []
      : await permitsOnHeldParcel(db, { holdId: active.id, parcelId: active.parcelId }, signal)
  return { holdOffered, civilOffered, holds, permits, civilActions }
}

export async function remedyFactsFor(
  db: DbOrTx,
  caseIds: readonly string[],
): Promise<Map<string, RemedyFacts>> {
  const facts = new Map<string, RemedyFacts>()
  if (!packHasCureRules() || caseIds.length === 0) return facts
  const ids = [...caseIds]
  const [holds, civil] = await Promise.all([
    db
      .select({ caseId: developmentHolds.caseId, releasedOn: developmentHolds.releasedOn })
      .from(developmentHolds)
      .where(inArray(developmentHolds.caseId, ids)),
    db
      .select({ caseId: enforcementCivilActions.caseId })
      .from(enforcementCivilActions)
      .where(inArray(enforcementCivilActions.caseId, ids)),
  ])
  for (const id of ids) {
    facts.set(id, {
      holdPlaced: holds.some((h) => h.caseId === id && h.releasedOn === null),
      civilActionFiled: civil.some((c) => c.caseId === id),
    })
  }
  return facts
}
