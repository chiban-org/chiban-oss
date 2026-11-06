'use server'

import { type ApplicationNoteError, addApplicationNote } from '@/features/applications/notes'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { isUuid } from '@/utils/uuid'

const COPY: Record<ApplicationNoteError, string> = {
  forbidden: errorCopy('forbidden'),
  invalid: 'Write the note before saving it.',
  not_found: errorCopy('not_found'),
}

export async function addApplicationNoteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = text(formData, 'applicationId')
    if (!isUuid(applicationId)) return { ok: false, error: errorCopy('invalid_input') }
    const body = text(formData, 'body')
    const result = await addApplicationNote(db, actor, { applicationId, body }, signal)
    if (!result.ok) return { ok: false, error: COPY[result.error] }
    return { ok: true, message: 'Note added.' }
  })
}
