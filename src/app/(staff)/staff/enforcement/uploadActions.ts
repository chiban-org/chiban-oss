'use server'

import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, errorCopy, runStaffValue } from '@/server/actionRunner'
import { parseForm, runStaffForm } from '@/server/formInput'
import { CASE_UPLOAD_FINALIZE_FORM, CASE_UPLOAD_INTENT_FORM } from './uploadForms'

type IntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }

const INTENT_COPY = {
  forbidden: 'You cannot add files to this case.',
  too_large: 'That file is too large.',
  empty: 'That file is empty. Choose a file with content.',
  type_not_allowed: 'Upload a PDF, JPEG, or PNG file.',
  series_required: 'You cannot add files here.',
  unknown_series: 'You cannot add files here.',
  doc_kind_not_allowed: 'That kind of document cannot be added to a case.',
  too_many_pending: errorCopy('too_many_pending'),
} as const

const FINALIZE_COPY = {
  forbidden: 'You cannot add files to this case.',
  expired: 'The upload took too long. Try again.',
  already_finalized: 'That upload was already completed.',
  not_uploaded: 'The file did not arrive. Try again.',
  size_mismatch: 'The file changed while it was sent. Try again.',
  type_mismatch: 'That file is not the kind of file it says it is.',
} as const

export async function createCaseUploadIntentAction(formData: FormData): Promise<IntentResponse> {
  const fail = (error: string): IntentResponse => ({ ok: false, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(CASE_UPLOAD_INTENT_FORM, formData)
    if (!parsed.ok) return fail(parsed.error.error)
    const { targetId, title, ...file } = parsed.value
    const made = await createUploadIntent(
      db,
      getObjectStore(),
      actor,
      { target: { kind: 'enforcement_case', id: targetId }, ...file, title: title ?? '' },
      signal,
    )
    return made.ok ? { ok: true, ...made.value } : fail(INTENT_COPY[made.error])
  })
}

export async function finalizeCaseUploadAction(
  formData: FormData,
): Promise<ActionResult & { documentId?: string }> {
  let documentId: string | undefined
  const result = await runStaffForm(
    formData,
    CASE_UPLOAD_FINALIZE_FORM,
    async ({ db, actor, signal }, input) => {
      const done = await finalizeUpload(db, getObjectStore(), actor, input, signal)
      if (!done.ok) return { ok: false, error: FINALIZE_COPY[done.error] }
      documentId = done.value.documentId
      return { ok: true, message: 'Uploaded.' }
    },
  )
  return result.ok && documentId !== undefined ? { ...result, documentId } : result
}
