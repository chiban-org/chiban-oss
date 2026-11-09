'use server'

import { z } from 'zod'
import { recordLetterMailed } from '@/features/decisions/letterDelivery'
import { civilDate, recordId } from '@/features/input/schemas'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'

const LETTER_MAILED_FORM = z.object({
  mailingId: recordId('the letter'),
  mailedOn: civilDate('the date mailed'),
})

const REFUSALS: Readonly<Record<string, string>> = {
  already_mailed: 'This letter is already recorded as mailed.',
  not_found: 'This letter is no longer on the list. Reload the page.',
}

export async function recordLetterMailedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, LETTER_MAILED_FORM, async ({ db, actor, signal }, input) => {
    const result = await recordLetterMailed(db, actor, input, signal)
    if (result.ok) return { ok: true, message: 'Mailing recorded.' }
    if (result.error === 'future_date') {
      return refuseField('mailedOn', 'Enter a date that is today or earlier.')
    }
    return { ok: false, error: REFUSALS[result.error] ?? errorCopy(result.error) }
  })
}
