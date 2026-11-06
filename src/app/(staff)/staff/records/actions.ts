'use server'

import { revalidatePath } from 'next/cache'
import { setAudiences, setPublic } from '@/features/documents/publish'
import { retryPreservation } from '@/features/preservation/preserve'
import { recordBuildingRemoved, setDocumentSeries } from '@/features/records/assignments'
import { placeHoldByReference } from '@/features/records/holdReferences'
import { releaseHold } from '@/features/records/holds'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import {
  AUDIENCES_FORM,
  buildingRemovedForm,
  PLACE_HOLD_FORM,
  PUBLIC_FORM,
  RELEASE_HOLD_FORM,
  RETRY_FORM,
  SERIES_FORM,
} from './documentForms'

const HOLD_COPY = {
  forbidden: errorCopy('forbidden'),
  reason_required: 'Enter a reason of at least 10 characters.',
  not_found: 'No record was found with that reference.',
  ambiguous: 'More than one record has that name. Use the application number.',
  already_disposed: 'That document was already disposed of, so there is nothing left to hold.',
} as const

const DOC_COPY = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  invalid_audience: errorCopy('invalid_input'),
  unknown_series: 'Choose a record series from the list.',
  doc_kind_not_allowed: 'Choose a record series from the list.',
  approval_required: 'Approve a version for the public before publishing this document.',
} as const

function failure(copy: string, field?: string): ActionResult {
  return field === undefined
    ? { ok: false, error: copy }
    : { ok: false, error: copy, fieldErrors: { [field]: copy } }
}

export async function setAudiencesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, AUDIENCES_FORM, async ({ db, actor, signal }, input) => {
    const result = await setAudiences(
      db,
      actor,
      { documentId: input.documentId, audiences: input.audience },
      signal,
    )
    return result.ok ? { ok: true, message: 'Audiences saved.' } : failure(DOC_COPY[result.error])
  })
}

export async function setPublicAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, PUBLIC_FORM, async ({ db, actor, signal }, input) => {
    const result = await setPublic(db, actor, input, signal)
    if (!result.ok) return failure(DOC_COPY[result.error])
    return {
      ok: true,
      message: input.isPublic ? 'The document is public.' : 'The document is not public.',
    }
  })
}

export async function assignSeriesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SERIES_FORM, async ({ db, actor, signal }, input) => {
    const result = await setDocumentSeries(db, actor, input, signal)
    if (result.ok) return { ok: true, message: 'Record series saved.' }
    return failure(
      DOC_COPY[result.error],
      result.error === 'unknown_series' ? 'seriesKey' : undefined,
    )
  })
}

export async function retryPreservationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RETRY_FORM, async ({ db, actor, signal }, input) => {
    const result = await retryPreservation(db, actor, { recordId: input.recordId }, signal)
    return result.ok
      ? { ok: true, message: 'Preservation will be tried again within a minute.' }
      : failure(DOC_COPY[result.error])
  })
}

export async function placeHoldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, PLACE_HOLD_FORM, async ({ db, actor, signal }, input) => {
    const result = await placeHoldByReference(
      db,
      actor,
      {
        kind: input.targetKind,
        reference: input.targetRef ?? input.targetId ?? '',
        reason: input.reason,
      },
      signal,
    )
    if (!result.ok)
      return failure(
        HOLD_COPY[result.error],
        result.error === 'forbidden' ? undefined : 'targetRef',
      )
    revalidatePath('/staff/records/holds')
    return { ok: true, message: 'Legal hold placed.' }
  })
}

export async function releaseHoldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RELEASE_HOLD_FORM, async ({ db, actor, signal }, input) => {
    const result = await releaseHold(db, actor, input, signal)
    if (!result.ok) return failure(HOLD_COPY[result.error])
    revalidatePath('/staff/records/holds')
    return { ok: true, message: 'Legal hold released.' }
  })
}

export async function recordBuildingRemovedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    buildingRemovedForm,
    async ({ db, actor, signal }, input) => {
      const result = await recordBuildingRemoved(db, actor, input, signal)
      if (result.ok) return { ok: true, message: 'Removal recorded.' }
      return result.error === 'not_found'
        ? failure(DOC_COPY.not_found, 'projectId')
        : failure(DOC_COPY.forbidden)
    },
  )
}
