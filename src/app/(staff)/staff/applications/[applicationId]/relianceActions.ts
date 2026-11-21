'use server'

import { z } from 'zod'
import { linkVarianceReliance } from '@/features/decisions/recordingGate'
import { recordId } from '@/features/input/schemas'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { applicationIdField, outcome } from './actionInput'

const RELIANCE_FORM = z.object({
  applicationId: applicationIdField(),
  varianceApplicationId: recordId('a variance'),
})

export async function linkRelianceAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RELIANCE_FORM, async ({ db, actor, signal }, input) =>
    outcome(
      await linkVarianceReliance(
        db,
        actor,
        {
          varianceApplicationId: input.varianceApplicationId,
          planningApplicationId: input.applicationId,
        },
        signal,
      ),
      'Variance linked.',
      { not_found: 'varianceApplicationId' },
    ),
  )
}
