import { isNotNull } from 'drizzle-orm'
import { applications } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { CENSUS_CLASSIFICATION, classifyForCensus } from '@/features/census/classify'
import { suggestCensus } from '@/features/census/suggest'
import { must } from '@/features/demo/seedPermitSupport'
import type { RtkSeedContext } from '@/features/demo/seedRtk'

export async function seedCensusDemo(ctx: RtkSeedContext): Promise<void> {
  const issued = await ctx.db
    .select({ id: applications.id })
    .from(applications)
    .where(isNotNull(applications.issuedOn))
  for (const row of issued) {
    const context = await loadApplicationContext(ctx.db, row.id, ctx.signal)
    if (context?.typeBody.classification !== CENSUS_CLASSIFICATION) continue
    const suggestion = suggestCensus(
      {
        workType: typeof context.values.work_type === 'string' ? context.values.work_type : null,
        classification: context.facts.classification,
        dwellingUnits: context.facts.dwellingUnits,
      },
      context.values,
    )
    must(
      await classifyForCensus(
        ctx.db,
        ctx.staff,
        {
          applicationId: row.id,
          ...(suggestion ?? {
            category: 'excluded',
            excludedReason: 'addition_or_alteration',
            phase: 'whole_building',
            buildings: 0,
            housingUnits: 0,
            valuationDollars: 0,
          }),
        },
        ctx.signal,
      ),
      'classify a demo building permit for the Census report',
    )
  }
}
