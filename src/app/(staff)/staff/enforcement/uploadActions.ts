'use server'

import type { DocKind } from '@/features/documents/types'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import { getObjectStore } from '@/features/storage/objectStore'
import { errorCopy, runStaffValue, text } from '@/server/actionRunner'
import { isUuid } from '@/utils/uuid'

type IntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }
type FinalizeResponse = { ok: true } | { ok: false; error: string }

const CASE_KINDS: readonly string[] = [
  'enforcement_photo',
  'enforcement_letter',
  'service_proof',
  'court_document',
]

const INTENT_COPY = {
  forbidden: 'You cannot add files to this case.',
  too_large: 'That file is too large.',
  empty: 'That file is empty. Choose a file with content.',
  type_not_allowed: 'Upload a PDF, JPEG, or PNG file.',
  series_required: 'You cannot add files here.',
  unknown_series: 'You cannot add files here.',
  doc_kind_not_allowed: 'That kind of document cannot be added to a case.',
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
  return await runStaffValue(
    formData,
    (error): IntentResponse => ({ ok: false, error }),
    async ({ db, actor, signal }) => {
      const caseId = text(formData, 'targetId')
      const docKind = text(formData, 'docKind')
      if (!isUuid(caseId) || !CASE_KINDS.includes(docKind)) {
        return { ok: false, error: errorCopy('invalid_input') }
      }
      const made = await createUploadIntent(
        db,
        getObjectStore(),
        actor,
        {
          target: { kind: 'enforcement_case', id: caseId },
          title: text(formData, 'title'),
          filename: text(formData, 'filename'),
          contentType: text(formData, 'contentType'),
          sizeBytes: Number(text(formData, 'sizeBytes')),
          docKind: docKind as DocKind,
        },
        signal,
      )
      return made.ok ? { ok: true, ...made.value } : { ok: false, error: INTENT_COPY[made.error] }
    },
  )
}

export async function finalizeCaseUploadAction(formData: FormData): Promise<FinalizeResponse> {
  return await runStaffValue(
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
