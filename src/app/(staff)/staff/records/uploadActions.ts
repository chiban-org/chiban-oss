'use server'

import { uploadRedactedCopy } from '@/features/documents/publish'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, errorCopy, runStaffValue } from '@/server/actionRunner'
import { parseForm, runStaffForm } from '@/server/formInput'
import { FINALIZE_FORM, REDACTED_FORM, UPLOAD_INTENT_FORM } from './documentForms'

export type StaffIntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }

const UPLOAD_COPY = {
  forbidden: errorCopy('forbidden'),
  too_large: 'That file is too large.',
  empty: 'That file is empty. Choose a file with content.',
  type_not_allowed: 'Upload a PDF, JPEG, or PNG file.',
  series_required: 'Choose a record series for a parcel file.',
  unknown_series: 'Choose a record series from the list.',
  doc_kind_not_allowed: 'That kind of document cannot be added here.',
  expired: 'The upload took too long. Try again.',
  already_finalized: 'That upload was already completed.',
  not_uploaded: 'The file did not arrive. Try again.',
  size_mismatch: 'The file changed while it was sent. Try again.',
  type_mismatch: 'That file is not the kind of file it says it is.',
  not_found: errorCopy('not_found'),
} as const

export async function createStaffUploadIntentAction(
  formData: FormData,
): Promise<StaffIntentResponse> {
  const fail = (error: string): StaffIntentResponse => ({ ok: false, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(UPLOAD_INTENT_FORM, formData)
    if (!parsed.ok) return fail(parsed.error.error)
    const { targetKind, targetId, title, seriesKey, ...file } = parsed.value
    const made = await createUploadIntent(
      db,
      getObjectStore(),
      actor,
      {
        target: { kind: targetKind, id: targetId },
        title: title ?? '',
        ...file,
        ...(seriesKey === null ? {} : { seriesKey }),
      },
      signal,
    )
    return made.ok ? { ok: true, ...made.value } : fail(UPLOAD_COPY[made.error])
  })
}

export async function finalizeStaffUploadAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, FINALIZE_FORM, async ({ db, actor, signal }, input) => {
    const choice = input.visibility === null ? {} : { isPublic: input.visibility === 'public' }
    const done = await finalizeUpload(
      db,
      getObjectStore(),
      actor,
      { intentId: input.intentId, ...choice },
      signal,
    )
    return done.ok
      ? { ok: true, message: 'Uploaded.' }
      : { ok: false, error: UPLOAD_COPY[done.error] }
  })
}

export async function uploadRedactedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, REDACTED_FORM, async ({ db, actor, signal }, input) => {
    const done = await uploadRedactedCopy(db, getObjectStore(), actor, input, signal)
    return done.ok
      ? { ok: true, message: 'Redacted copy uploaded.' }
      : { ok: false, error: UPLOAD_COPY[done.error] }
  })
}
