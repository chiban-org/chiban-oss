import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { clocks, decisionNotices, deemedRefusals } from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { effectiveBindings } from '@/features/config/bindings'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

export interface DecisionNoticeView {
  required: boolean
  dueOn: CivilDate | null
  mailedOn: CivilDate | null
  refusedOn: CivilDate | null
  citation: string | null
}

export async function loadDecisionNotice(
  db: Db,
  app: ApplicationContext,
): Promise<DecisionNoticeView | null> {
  const pack = loadPack()
  const bound = new Set(effectiveBindings(app.typeBody, pack))
  const rule = pack.rules.find(
    (r) => bound.has(r.key) && r.kind === 'clock' && r.consequence.kind === 'deemed_refused',
  )
  if (rule === undefined) return null
  const [clock] = await db
    .select({ currentDue: clocks.currentDue })
    .from(clocks)
    .where(and(eq(clocks.applicationId, app.id), eq(clocks.ruleKey, rule.key)))
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  const [notice] = await db
    .select({ mailedOn: decisionNotices.mailedOn })
    .from(decisionNotices)
    .where(eq(decisionNotices.applicationId, app.id))
  const [refusal] = await db
    .select({ firedOn: deemedRefusals.firedOn })
    .from(deemedRefusals)
    .where(eq(deemedRefusals.applicationId, app.id))
  return {
    required: true,
    dueOn: (clock?.currentDue as CivilDate | undefined) ?? null,
    mailedOn: (notice?.mailedOn as CivilDate | undefined) ?? null,
    refusedOn: (refusal?.firedOn as CivilDate | undefined) ?? null,
    citation: rule.citation.label,
  }
}
