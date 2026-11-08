'use server'

import { z } from 'zod'
import { env } from '@/config/env'
import { ITEM_KEY_MAX } from '@/features/applications/documentItemSchema'
import { FILENAME_MAX, TITLE_MAX } from '@/features/documents/uploadLimits'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import { choice, optionalText, recordId, requiredText, wholeNumber } from '@/features/input/schemas'
import { getObjectStore } from '@/features/storage/objectStore'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

export type IntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }
export type FinalizeResponse = { ok: true } | { ok: false; error: string }

const MB = 1024 * 1024

const CONTENT_TYPE_MAX = 200

const CANNOT_ADD = 'You cannot add files here.'

const INTENT_COPY = {
  forbidden: CANNOT_ADD,
  too_large: `That file is larger than ${Math.floor(env.MAX_UPLOAD_BYTES / MB)} MB.`,
  empty: 'That file is empty. Choose a file with content.',
  type_not_allowed: 'Upload a PDF, JPEG, or PNG file.',
  series_required: CANNOT_ADD,
  unknown_series: CANNOT_ADD,
  doc_kind_not_allowed: CANNOT_ADD,
} as const

const FINALIZE_COPY = {
  forbidden: 'You cannot add files here.',
  expired: 'The upload took too long. Choose the file and try again.',
  already_finalized: 'That upload was already completed.',
  not_uploaded: 'The file did not arrive. Try again.',
  size_mismatch: 'The file changed while it was sent. Try again.',
  type_mismatch: 'That file is not the kind of file it says it is.',
} as const

const IntentForm = z.object({
  targetKind: choice('where to attach the file', ['application', 'project']),
  targetId: recordId('a record'),
  title: requiredText('a document name', { max: TITLE_MAX }),
  filename: requiredText('a file name', { max: FILENAME_MAX }),
  contentType: optionalText('a file type', { max: CONTENT_TYPE_MAX }),
  sizeBytes: wholeNumber('the file size', { min: 0, max: Number.MAX_SAFE_INTEGER }),
  itemKey: optionalText('a document', { max: ITEM_KEY_MAX }),
})

const FinalizeForm = z.object({ intentId: recordId('an upload') })

export async function createUploadIntentAction(formData: FormData): Promise<IntentResponse> {
  return await withPortalActor(
    formData,
    (error): IntentResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const parsed = parseForm(IntentForm, formData)
      if (!parsed.ok) return { ok: false, error: parsed.error.error }
      const { targetKind, targetId, title, filename, contentType, sizeBytes, itemKey } =
        parsed.value
      const made = await createUploadIntent(
        db,
        getObjectStore(),
        actor,
        {
          target: { kind: targetKind, id: targetId },
          title,
          filename,
          contentType: contentType ?? '',
          sizeBytes,
          ...(itemKey === null ? {} : { itemKey }),
        },
        signal,
      )
      return made.ok ? { ok: true, ...made.value } : { ok: false, error: INTENT_COPY[made.error] }
    },
  )
}

export async function finalizeUploadAction(formData: FormData): Promise<FinalizeResponse> {
  return await withPortalActor(
    formData,
    (error): FinalizeResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const parsed = parseForm(FinalizeForm, formData)
      if (!parsed.ok) return { ok: false, error: parsed.error.error }
      const { intentId } = parsed.value
      const done = await finalizeUpload(db, getObjectStore(), actor, { intentId }, signal)
      return done.ok ? { ok: true } : { ok: false, error: FINALIZE_COPY[done.error] }
    },
  )
}
