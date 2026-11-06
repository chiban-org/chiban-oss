'use server'

import { classifyForCensus } from '@/features/census/classify'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { recordsOutcome } from '@/server/recordsAction'
import { CENSUS_FORM } from './censusForm'

export async function classifyCensusAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CENSUS_FORM, async ({ db, actor, signal }, input) =>
    recordsOutcome(await classifyForCensus(db, actor, input, signal), 'Classification saved.', {
      units_do_not_fit_category: 'housingUnits',
      excluded_reason_required: 'excludedReason',
      reason_without_exclusion: 'excludedReason',
      excluded_carries_counts: 'buildings',
      phase_counts_must_be_zero: 'buildings',
    }),
  )
}
