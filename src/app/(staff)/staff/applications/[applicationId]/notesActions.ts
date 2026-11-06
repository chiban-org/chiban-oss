'use server'

import { z } from 'zod'
import { NOTE_MAX_LENGTH } from '@/features/applications/noteLimits'
import { addApplicationNote } from '@/features/applications/notes'
import { requiredText } from '@/features/input/schemas'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { applicationIdField } from './actionInput'

const NOTE_FORM = z.object({
  applicationId: applicationIdField(),
  body: requiredText('a note', { max: NOTE_MAX_LENGTH }),
})

export async function addApplicationNoteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, NOTE_FORM, async ({ db, actor, signal }, input) => {
    const result = await addApplicationNote(db, actor, input, signal)
    if (result.ok) return { ok: true, message: 'Note added.' }
    if (result.error === 'invalid') return refuseField('body', 'Enter a note.')
    return { ok: false, error: errorCopy(result.error) }
  })
}
