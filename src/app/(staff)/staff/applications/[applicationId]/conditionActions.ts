'use server'

import { z } from 'zod'
import { applyCondition, setConditionStatus } from '@/features/conditions/applicationConditions'
import { choice, optionalText, recordId, requiredText } from '@/features/input/schemas'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { applicationIdField, outcome } from './actionInput'

const WAIVER_REASON = 'Enter a reason of at least 10 characters.'

const APPLY_FORM = z.object({
  applicationId: applicationIdField(),
  code: requiredText('a condition', { max: 200 }),
})

const STATUS_FORM = z.object({
  conditionId: recordId('a condition'),
  status: choice('a status', ['unmet', 'met', 'waived'] as const),
  reason: optionalText('a reason', { max: 2000 }),
})

export async function applyConditionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, APPLY_FORM, async ({ db, actor, signal }, input) =>
    outcome(await applyCondition(db, actor, input, signal), 'Condition applied.', {
      unknown_condition: 'code',
      already_applied: 'code',
    }),
  )
}

export async function setConditionStatusAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, STATUS_FORM, async ({ db, actor, signal }, input) => {
    const result = await setConditionStatus(
      db,
      actor,
      {
        conditionId: input.conditionId,
        status: input.status,
        ...(input.reason === null ? {} : { reason: input.reason }),
      },
      signal,
    )
    if (!result.ok && result.error === 'reason_required')
      return refuseField('reason', WAIVER_REASON)
    return outcome(result, 'Condition updated.')
  })
}
