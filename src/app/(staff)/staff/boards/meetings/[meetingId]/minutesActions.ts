'use server'

import { revalidatePath } from 'next/cache'
import { type MinutesError, recordMinutes } from '@/features/boards/minutes'
import {
  createUploadIntent,
  type FinalizeError,
  finalizeUpload,
} from '@/features/documents/uploads'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, errorCopy, runStaffValue } from '@/server/actionRunner'
import { parseForm, refuseField, runStaffForm } from '@/server/formInput'
import { FINALIZE_UPLOAD_FORM, RECORD_MINUTES_FORM, UPLOAD_INTENT_FORM } from './minutesForms'

type IntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }

type IntentError = Extract<Awaited<ReturnType<typeof createUploadIntent>>, { ok: false }>['error']

const UPLOAD_COPY: Record<IntentError | FinalizeError, string> = {
  forbidden: errorCopy('forbidden'),
  too_large: 'That file is too large.',
  empty: 'That file is empty. Choose a file with content.',
  type_not_allowed: 'Upload a PDF, JPEG, or PNG file.',
  series_required: errorCopy('invalid_input'),
  unknown_series: errorCopy('invalid_input'),
  doc_kind_not_allowed: errorCopy('invalid_input'),
  too_many_pending: errorCopy('too_many_pending'),
  expired: 'The upload took too long. Try again.',
  already_finalized: 'That upload was already completed.',
  not_uploaded: 'The file did not arrive. Try again.',
  size_mismatch: 'The file changed while it was sent. Try again.',
  type_mismatch: 'That file is not the kind of file it says it is.',
}

const MINUTES_COPY: Record<MinutesError, string> = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  meeting_cancelled: 'That meeting was cancelled, so it has no minutes.',
  not_held: 'The meeting has not been held yet.',
  document_not_found: 'Upload the minutes to this meeting first, then choose them.',
  already_approved: 'The approved minutes are the record of this meeting and cannot be replaced.',
  approval_date_required: 'Enter the date the board approved the minutes.',
  future_date: 'The approval date cannot be in the future.',
  before_meeting: 'The minutes cannot be approved before the meeting was held.',
}

const meetingPath = (meetingId: string) => `/staff/boards/meetings/${meetingId}`

export async function createMeetingUploadIntentAction(formData: FormData): Promise<IntentResponse> {
  const fail = (error: string): IntentResponse => ({ ok: false, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(UPLOAD_INTENT_FORM, formData)
    if (!parsed.ok) return fail(parsed.error.error)
    const { targetId, title, ...file } = parsed.value
    const made = await createUploadIntent(
      db,
      getObjectStore(),
      actor,
      { target: { kind: 'meeting', id: targetId }, title: title ?? '', ...file },
      signal,
    )
    return made.ok ? { ok: true, ...made.value } : fail(UPLOAD_COPY[made.error])
  })
}

export async function finalizeMeetingUploadAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    FINALIZE_UPLOAD_FORM,
    async ({ db, actor, signal }, input) => {
      const done = await finalizeUpload(db, getObjectStore(), actor, input, signal)
      return done.ok
        ? { ok: true, message: 'Uploaded. Choose it below to record it as the minutes.' }
        : { ok: false, error: UPLOAD_COPY[done.error] }
    },
  )
}

const MINUTES_FIELD: Partial<Record<MinutesError, string>> = {
  approval_date_required: 'approvedOn',
  future_date: 'approvedOn',
  before_meeting: 'approvedOn',
  document_not_found: 'documentId',
}

export async function recordMinutesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RECORD_MINUTES_FORM, async ({ db, actor, signal }, input) => {
    const recorded = await recordMinutes(db, actor, input, signal)
    if (!recorded.ok) {
      const copy = MINUTES_COPY[recorded.error]
      const field = MINUTES_FIELD[recorded.error]
      return field === undefined ? { ok: false, error: copy } : refuseField(field, copy)
    }
    revalidatePath(meetingPath(input.meetingId))
    return {
      ok: true,
      message:
        input.status === 'approved'
          ? 'Approved minutes recorded. They are now public.'
          : 'Draft minutes recorded. They are not public.',
    }
  })
}
