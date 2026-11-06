'use server'

import { z } from 'zod'
import type { CheckOutcome } from '@/components/permits/useCorrectionCheck'
import { requiredText } from '@/features/input/schemas'
import { checkCorrection } from '@/features/permits/correction/checkCorrection'
import { correctPermit } from '@/features/permits/correction/correctPermit'
import { type ActionResult, errorCopy, runStaffValue } from '@/server/actionRunner'
import { parseForm, runStaffForm } from '@/server/formInput'
import { APPLICATION_FORM, applicationIdField, INVALID } from './actionInput'
import {
  correctionFailure,
  draftOf,
  feeRefusal,
  fieldErrorsOf,
  reviewRefusal,
} from './correctionInput'

export async function checkCorrectionAction(formData: FormData): Promise<CheckOutcome> {
  return await runStaffValue<CheckOutcome>(
    formData,
    (error) => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const parsed = parseForm(APPLICATION_FORM, formData)
      if (!parsed.ok) return { ok: false, error: parsed.error.error }
      const draft = draftOf(formData)
      if (draft === null) return { ok: false, error: errorCopy('invalid_input') }
      const checked = await checkCorrection(db, actor, draft, signal)
      if (!checked.ok) return { ok: false, error: errorCopy(checked.error) }
      const { review, feeChange, notify, fieldErrors } = checked.value
      const refusal = review.length > 0 ? reviewRefusal(review) : feeChange ? feeRefusal() : null
      return {
        ok: true,
        feeLine: feeChange ? feeRefusal() : 'No fee changes',
        refusal,
        notify,
        fieldErrors: fieldErrorsOf(fieldErrors),
      }
    },
  )
}

const CORRECTION_FORM = z.object({
  applicationId: applicationIdField(),
  projectTitle: requiredText('the project title', { max: 200 }),
  reason: requiredText('the reason for the correction', { max: 2000 }),
})

export async function correctPermitAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CORRECTION_FORM, async ({ db, actor, signal }, input) => {
    const draft = draftOf(formData)
    if (draft === null) return INVALID
    const done = await correctPermit(
      db,
      actor,
      { ...draft, projectTitle: input.projectTitle, reason: input.reason },
      signal,
    )
    if (!done.ok) return correctionFailure(done.error)
    return { ok: true, message: `Permit reissued as revision ${done.value.revision}.` }
  })
}
