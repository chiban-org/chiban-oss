'use server'

import { z } from 'zod'
import { CENSUS_CATEGORIES, CENSUS_EXCLUDED_REASONS, CENSUS_PHASES } from '@/db/schema'
import { classifyForCensus } from '@/features/census/classify'
import type { ActionResult } from '@/server/actionRunner'
import { optionalField, runRecords, uuidField } from '@/server/recordsAction'

const count = z.coerce.number().int().min(0)

export async function classifyCensusAction(formData: FormData): Promise<ActionResult> {
  return await runRecords(
    formData,
    z.object({
      applicationId: uuidField,
      category: z.enum(CENSUS_CATEGORIES),
      excludedReason: optionalField(z.enum(CENSUS_EXCLUDED_REASONS)),
      phase: z.enum(CENSUS_PHASES),
      buildings: count,
      housingUnits: count,
      valuationDollars: count,
    }),
    ({ db, actor, signal }, v) =>
      classifyForCensus(
        db,
        actor,
        {
          applicationId: v.applicationId,
          category: v.category,
          excludedReason: v.excludedReason ?? null,
          phase: v.phase,
          buildings: v.buildings,
          housingUnits: v.housingUnits,
          valuationDollars: v.valuationDollars,
        },
        signal,
      ),
    'Classification saved.',
  )
}
