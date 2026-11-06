'use server'

import { env } from '@/config/env'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import { getObjectStore } from '@/features/storage/objectStore'
import { errorCopy, text } from '@/server/actionRunner'
import { withPortalActor } from '@/server/portalAction'
import { isUuid } from '@/utils/uuid'

export type IntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }
export type FinalizeResponse = { ok: true } | { ok: false; error: string }

const MB = 1024 * 1024

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

export async function createUploadIntentAction(formData: FormData): Promise<IntentResponse> {
  return await withPortalActor(
    formData,
    (error): IntentResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const kind = text(formData, 'targetKind')
      const id = text(formData, 'targetId')
      if ((kind !== 'application' && kind !== 'project') || !isUuid(id)) {
        return { ok: false, error: errorCopy('invalid_input') }
      }
      const made = await createUploadIntent(
        db,
        getObjectStore(),
        actor,
        {
          target: { kind, id },
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

export async function finalizeUploadAction(formData: FormData): Promise<FinalizeResponse> {
  return await withPortalActor(
    formData,
    (error): FinalizeResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const intentId = text(formData, 'intentId')
      if (!isUuid(intentId)) return { ok: false, error: errorCopy('invalid_input') }
      const done = await finalizeUpload(db, getObjectStore(), actor, { intentId }, signal)
      return done.ok ? { ok: true } : { ok: false, error: FINALIZE_COPY[done.error] }
    },
  )
}
