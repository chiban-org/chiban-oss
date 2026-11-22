'use server'

import { z } from 'zod'
import { recordId, requiredText } from '@/features/input/schemas'
import { getObjectStore } from '@/features/storage/objectStore'
import { printLetter } from '@/features/templates/printLetter'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'

const PRINT_LETTER_FORM = z.object({
  applicationId: recordId('the application'),
  templateKey: requiredText('a letter', { max: 200 }),
})

const LETTER_BROKEN =
  'This letter template could not be filled in. Check the template in Settings, then try again.'

export async function printLetterAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, PRINT_LETTER_FORM, async ({ db, actor, signal }, input) => {
    const printed = await printLetter(db, actor, input, getObjectStore(), signal)
    if (printed.ok) {
      return { ok: true, message: 'Letter printed. It is in the documents for this application.' }
    }
    if (printed.error === 'unknown_letter') {
      return refuseField('templateKey', 'Choose a letter from the list.')
    }
    if (printed.error === 'letter_broken') return { ok: false, error: LETTER_BROKEN }
    return { ok: false, error: errorCopy(printed.error) }
  })
}
