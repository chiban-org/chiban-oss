'use server'

import type { CheckOutcome } from '@/components/permits/useCorrectionCheck'
import { checkCorrection } from '@/features/permits/correction/checkCorrection'
import { correctPermit } from '@/features/permits/correction/correctPermit'
import {
  type ActionResult,
  errorCopy,
  runStaffAction,
  runStaffValue,
  text,
} from '@/server/actionRunner'
import { INVALID } from './actionInput'
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

export async function correctPermitAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const draft = draftOf(formData)
    if (draft === null) return INVALID
    const done = await correctPermit(
      db,
      actor,
      { ...draft, projectTitle: text(formData, 'projectTitle'), reason: text(formData, 'reason') },
      signal,
    )
    if (!done.ok) return correctionFailure(done.error)
    return { ok: true, message: `Permit reissued as revision ${done.value.revision}.` }
  })
}
