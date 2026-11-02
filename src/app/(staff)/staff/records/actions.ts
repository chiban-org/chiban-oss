'use server'

import { revalidatePath } from 'next/cache'
import { setAudiences, setPublic, uploadRedactedCopy } from '@/features/documents/publish'
import { AUDIENCES, type Audience } from '@/features/documents/types'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import { retryPreservation } from '@/features/preservation/preserve'
import { recordBuildingRemoved, setDocumentSeries } from '@/features/records/assignments'
import { placeHoldByReference, releaseHold } from '@/features/records/holds'
import { getObjectStore } from '@/features/storage/objectStore'
import {
  type ActionResult,
  errorCopy,
  runStaffAction,
  runStaffValue,
  text,
} from '@/server/actionRunner'
import { parseCivilDate } from '@/types/civilDate'
import { isUuid } from '@/utils/uuid'

const invalid = (): ActionResult => ({ ok: false, error: errorCopy('invalid_input') })

const HOLD_COPY = {
  forbidden: errorCopy('forbidden'),
  reason_required: 'Enter a reason of at least 10 characters.',
  not_found: 'No record was found with that reference.',
  ambiguous: 'More than one record has that name. Use the application number.',
} as const

const DOC_COPY = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  invalid_audience: errorCopy('invalid_input'),
  unknown_series: 'Choose a record series from the list.',
} as const

const UPLOAD_COPY = {
  forbidden: errorCopy('forbidden'),
  too_large: 'That file is too large.',
  empty: 'That file is empty. Choose a file with content.',
  type_not_allowed: 'Upload a PDF, JPEG, or PNG file.',
  series_required: 'Choose a record series for a parcel file.',
  unknown_series: 'Choose a record series from the list.',
  expired: 'The upload took too long. Try again.',
  already_finalized: 'That upload was already completed.',
  not_uploaded: 'The file did not arrive. Try again.',
  size_mismatch: 'The file changed while it was sent. Try again.',
  type_mismatch: 'That file is not the kind of file it says it is.',
  not_found: errorCopy('not_found'),
} as const

function audiencesOf(formData: FormData): Audience[] {
  return formData
    .getAll('audience')
    .filter(
      (v): v is Audience => typeof v === 'string' && (AUDIENCES as readonly string[]).includes(v),
    )
}

export async function setAudiencesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const documentId = text(formData, 'documentId')
    if (!isUuid(documentId)) return invalid()
    const result = await setAudiences(
      db,
      actor,
      { documentId, audiences: audiencesOf(formData) },
      signal,
    )
    return result.ok
      ? { ok: true, message: 'Audiences saved.' }
      : { ok: false, error: DOC_COPY[result.error] }
  })
}

export async function setPublicAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const documentId = text(formData, 'documentId')
    if (!isUuid(documentId)) return invalid()
    const isPublic = text(formData, 'isPublic') === 'true'
    const result = await setPublic(db, actor, { documentId, isPublic }, signal)
    return result.ok
      ? { ok: true, message: isPublic ? 'The document is public.' : 'The document is not public.' }
      : { ok: false, error: DOC_COPY[result.error] }
  })
}

export async function assignSeriesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const documentId = text(formData, 'documentId')
    if (!isUuid(documentId)) return invalid()
    const result = await setDocumentSeries(
      db,
      actor,
      { documentId, seriesKey: text(formData, 'seriesKey') },
      signal,
    )
    return result.ok
      ? { ok: true, message: 'Record series saved.' }
      : { ok: false, error: DOC_COPY[result.error] }
  })
}

export async function retryPreservationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const recordId = text(formData, 'recordId')
    if (!isUuid(recordId)) return invalid()
    const result = await retryPreservation(db, actor, { recordId }, signal)
    return result.ok
      ? { ok: true, message: 'Preservation will be tried again within a minute.' }
      : { ok: false, error: DOC_COPY[result.error] }
  })
}

export async function placeHoldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = text(formData, 'targetKind')
    if (kind !== 'project' && kind !== 'application' && kind !== 'document') return invalid()
    const reference = text(formData, 'targetRef') || text(formData, 'targetId')
    const result = await placeHoldByReference(
      db,
      actor,
      { kind, reference, reason: text(formData, 'reason') },
      signal,
    )
    if (!result.ok) return { ok: false, error: HOLD_COPY[result.error] }
    revalidatePath('/staff/records/holds')
    return { ok: true, message: 'Legal hold placed.' }
  })
}

export async function releaseHoldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const holdId = text(formData, 'holdId')
    if (!isUuid(holdId)) return invalid()
    const result = await releaseHold(
      db,
      actor,
      { holdId, reason: text(formData, 'reason') },
      signal,
    )
    if (!result.ok) return { ok: false, error: HOLD_COPY[result.error] }
    revalidatePath('/staff/records/holds')
    return { ok: true, message: 'Legal hold released.' }
  })
}

export async function recordBuildingRemovedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const projectId = text(formData, 'projectId')
    const date = parseCivilDate(text(formData, 'occurredOn'))
    if (!isUuid(projectId) || !date.ok) return invalid()
    const result = await recordBuildingRemoved(
      db,
      actor,
      { projectId, occurredOn: date.value },
      signal,
    )
    return result.ok
      ? { ok: true, message: 'Removal recorded.' }
      : { ok: false, error: errorCopy('forbidden') }
  })
}

export type StaffIntentResponse =
  | { ok: true; intentId: string; url: string; headers: Record<string, string> }
  | { ok: false; error: string }

export async function createStaffUploadIntentAction(
  formData: FormData,
): Promise<StaffIntentResponse> {
  const fail = (error: string): StaffIntentResponse => ({ ok: false, error })
  return await runStaffValue(formData, fail, async ({ db, actor, signal }) => {
    const kind = text(formData, 'targetKind')
    const id = text(formData, 'targetId')
    if ((kind !== 'parcel' && kind !== 'project' && kind !== 'application') || !isUuid(id)) {
      return fail(errorCopy('invalid_input'))
    }
    const seriesKey = text(formData, 'seriesKey')
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
        ...(seriesKey === '' ? {} : { seriesKey }),
      },
      signal,
    )
    return made.ok ? { ok: true, ...made.value } : fail(UPLOAD_COPY[made.error])
  })
}

export async function finalizeStaffUploadAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const intentId = text(formData, 'intentId')
    if (!isUuid(intentId)) return invalid()
    const done = await finalizeUpload(db, getObjectStore(), actor, { intentId }, signal)
    return done.ok
      ? { ok: true, message: 'Uploaded.' }
      : { ok: false, error: UPLOAD_COPY[done.error] }
  })
}

export async function uploadRedactedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const documentId = text(formData, 'documentId')
    const intentId = text(formData, 'intentId')
    if (!isUuid(documentId) || !isUuid(intentId)) return invalid()
    const done = await uploadRedactedCopy(
      db,
      getObjectStore(),
      actor,
      { documentId, intentId },
      signal,
    )
    return done.ok
      ? { ok: true, message: 'Redacted copy uploaded.' }
      : { ok: false, error: UPLOAD_COPY[done.error] }
  })
}
