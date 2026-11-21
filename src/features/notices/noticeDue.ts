import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  desProximityDeterminations,
  regionalImpactDeterminations,
  sourceWaterDeterminations,
} from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import { townLeads } from '@/features/notices/deriveItems'
import { planRequirement, type RequirementFlags } from '@/features/notices/requirementPlan'
import { requirementsFor } from '@/features/notices/requirementsFor'
import { loadPack } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import { type CivilDate, compareCivil } from '@/types/civilDate'

async function strictestFlags(db: DbOrTx, applicationId: string): Promise<RequirementFlags> {
  const [[ri], [des], [sourceWater]] = await Promise.all([
    db
      .select({ determination: regionalImpactDeterminations.determination })
      .from(regionalImpactDeterminations)
      .where(eq(regionalImpactDeterminations.applicationId, applicationId)),
    db
      .select({ determination: desProximityDeterminations.determination })
      .from(desProximityDeterminations)
      .where(eq(desProximityDeterminations.applicationId, applicationId)),
    db
      .select({ determination: sourceWaterDeterminations.determination })
      .from(sourceWaterDeterminations)
      .where(eq(sourceWaterDeterminations.applicationId, applicationId)),
  ])
  const hasRegionalImpact = packRoles().rules.regionalImpactDetermination !== null
  return {
    regionalImpact: hasRegionalImpact && (ri === undefined || ri.determination === 'yes'),
    desWithin: des === undefined || des.determination === 'within_500ft',
    sourceWaterArea: sourceWater === undefined || sourceWater.determination === 'within',
  }
}

export async function earliestNoticeDue(
  db: DbOrTx,
  app: ApplicationContext,
  signal: AbortSignal,
): Promise<(hearingDate: CivilDate) => CivilDate | null> {
  const classification = loadPack().classifications.find(
    (c) => c.key === app.typeBody.classification,
  )
  if (classification === undefined) return () => null
  const flags = await strictestFlags(db, app.id)
  const rules = requirementsFor(classification, flags, 'before_hearing')
  const leads = await townLeads(db, rules, signal)
  return (hearingDate) =>
    rules
      .map((rule) =>
        planRequirement(rule, {
          hearingDate,
          flags,
          townLeadDays: leads,
          publicChoice: null,
          stage: 'before_hearing',
        }),
      )
      .flatMap((plan) => (plan === null ? [] : [plan.dueOn]))
      .reduce<CivilDate | null>(
        (earliest, due) => (earliest === null || compareCivil(due, earliest) < 0 ? due : earliest),
        null,
      )
}
