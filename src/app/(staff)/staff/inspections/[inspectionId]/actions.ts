'use server'

import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { parseResultForm } from '@/features/inspections/resultForm'
import { getObjectStore } from '@/features/storage/objectStore'
import {
  type ActionResult,
  errorCopy,
  runStaffAction,
  runStaffValue,
  text,
} from '@/server/actionRunner'
import { isUuid } from '@/utils/uuid'

const STALE_COPY = 'This inspection changed since you opened it'

const RESULT_COPY: Record<string, string> = {
  stale_version: STALE_COPY,
  not_found: 'That inspection was not found.',
  forbidden: errorCopy('forbidden'),
  not_scheduled: 'This inspection is not scheduled for today or earlier.',
  permit_suspended: 'Inspections are paused while this permit is under appeal.',
  unknown_item: errorCopy('invalid_input'),
  result_conflicts_items:
    'The result does not match the checklist. A pass needs every required item passed.',
  notes_required: 'Write at least 10 characters about what failed.',
}

export type PhotoIntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }
export type PhotoFinalizeResponse = { ok: true } | { ok: false; error: string }

const PHOTO_FORBIDDEN = 'You cannot add photos here.'
const MAX_PHOTO_MB = 25

const INTENT_COPY = {
  forbidden: PHOTO_FORBIDDEN,
  too_large: `That photo is larger than ${MAX_PHOTO_MB} MB.`,
  empty: 'That file is empty. Choose a file with content.',
  type_not_allowed: 'Use a JPEG or PNG photo.',
  series_required: PHOTO_FORBIDDEN,
  unknown_series: PHOTO_FORBIDDEN,
  doc_kind_not_allowed: PHOTO_FORBIDDEN,
} as const

const FINALIZE_COPY = {
  forbidden: PHOTO_FORBIDDEN,
  expired: 'The upload took too long. Take the photo again.',
  already_finalized: 'That photo was already added.',
  not_uploaded: 'The photo did not arrive. Try again.',
  size_mismatch: 'The photo changed while it was sent. Try again.',
  type_mismatch: 'That file is not a photo.',
} as const

export async function recordResultAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const input = parseResultForm(formData)
    if (input === null) return { ok: false, error: errorCopy('invalid_input') }
    const result = await recordInspectionResult(db, actor, input, signal)
    if (result.ok) {
      return {
        ok: true,
        message: result.value.closed
          ? 'Result recorded. The permit is closed.'
          : 'Result recorded.',
      }
    }
    if (typeof result.error === 'object') {
      return { ok: false, error: 'The permit cannot be closed yet. Ask the land use office.' }
    }
    return { ok: false, error: RESULT_COPY[result.error] ?? errorCopy(result.error) }
  })
}

export async function createPhotoUploadIntentAction(
  formData: FormData,
): Promise<PhotoIntentResponse> {
  return await runStaffValue(
    formData,
    (error): PhotoIntentResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const id = text(formData, 'targetId')
      if (!isUuid(id)) return { ok: false, error: errorCopy('invalid_input') }
      const made = await createUploadIntent(
        db,
        getObjectStore(),
        actor,
        {
          target: { kind: 'inspection', id },
          title: text(formData, 'title'),
          filename: text(formData, 'filename'),
          contentType: text(formData, 'contentType'),
          sizeBytes: Number(text(formData, 'sizeBytes')),
        },
        signal,
      )
      return made.ok ? { ok: true, ...made.value } : { ok: false, error: INTENT_COPY[made.error] }
    },
  )
}

export async function finalizePhotoUploadAction(
  formData: FormData,
): Promise<PhotoFinalizeResponse> {
  return await runStaffValue(
    formData,
    (error): PhotoFinalizeResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const intentId = text(formData, 'intentId')
      if (!isUuid(intentId)) return { ok: false, error: errorCopy('invalid_input') }
      const done = await finalizeUpload(db, getObjectStore(), actor, { intentId }, signal)
      return done.ok ? { ok: true } : { ok: false, error: FINALIZE_COPY[done.error] }
    },
  )
}
