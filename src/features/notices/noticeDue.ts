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
import type { ProceedingClassification } from '@/features/packs/schema'
import { type CivilDate, compareCivil } from '@/types/civilDate'

const EVERY_FLAG: RequirementFlags = {
  regionalImpact: true,
  desWithin: true,
  sourceWaterArea: true,
}

function asksSourceWater(classification: ProceedingClassification): boolean {
  return requirementsFor(classification, EVERY_FLAG, 'before_hearing').some(
    (rule) => rule.onlyWhen === 'source_water_area',
  )
}

async function sourceWaterRow(db: DbOrTx, applicationId: string, asked: boolean) {
  if (!asked) return []
  return await db
    .select({ determination: sourceWaterDeterminations.determination })
    .from(sourceWaterDeterminations)
    .where(eq(sourceWaterDeterminations.applicationId, applicationId))
}

async function strictestFlags(
  db: DbOrTx,
  applicationId: string,
  classification: ProceedingClassification,
): Promise<RequirementFlags> {
  const asked = asksSourceWater(classification)
  const [[ri], [des], [sourceWater]] = await Promise.all([
    db
      .select({ determination: regionalImpactDeterminations.determination })
      .from(regionalImpactDeterminations)
      .where(eq(regionalImpactDeterminations.applicationId, applicationId)),
    db
      .select({ determination: desProximityDeterminations.determination })
      .from(desProximityDeterminations)
      .where(eq(desProximityDeterminations.applicationId, applicationId)),
    sourceWaterRow(db, applicationId, asked),
  ])
  const hasRegionalImpact = packRoles().rules.regionalImpactDetermination !== null
  return {
    regionalImpact: hasRegionalImpact && (ri === undefined || ri.determination === 'yes'),
    desWithin: des === undefined || des.determination === 'within_500ft',
    sourceWaterArea: asked && (sourceWater === undefined || sourceWater.determination === 'within'),
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
  const flags = await strictestFlags(db, app.id, classification)
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
