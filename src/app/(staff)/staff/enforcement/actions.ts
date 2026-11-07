'use server'

import { redirect } from 'next/navigation'
import type { Db } from '@/db/client'
import {
  findParcel,
  type ParcelLookupError,
  parcelForLocation,
  setCaseParcel,
} from '@/features/enforcement/caseParcel'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordComplaint } from '@/features/enforcement/complaints'
import { REPEAT_SUBMIT_WINDOW_SECONDS } from '@/features/enforcement/openCaseReuse'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { ok, type Result } from '@/types/result'
import {
  OPEN_CASE_FORM,
  SET_CASE_PARCEL_FORM,
  SET_CASE_STATUS_FORM,
  STAFF_COMPLAINT_FORM,
} from './caseForms'
import { settled } from './enforcementResult'

const PARCEL_FIELD = { parcel_not_found: 'parcelRef', parcel_ambiguous: 'parcelRef' }

async function parcelFor(
  db: Db,
  input: { parcelRef: string | null; locationText: string },
  signal: AbortSignal,
): Promise<Result<string | undefined, ParcelLookupError>> {
  if (input.parcelRef === null) {
    return ok(await parcelForLocation(db, input.locationText, signal))
  }
  return await findParcel(db, input.parcelRef, signal)
}

export async function openCaseAction(formData: FormData): Promise<ActionResult> {
  const outcome: { caseId?: string } = {}
  const result = await runStaffForm(
    formData,
    OPEN_CASE_FORM,
    async ({ db, actor, signal }, input) => {
      const parcel = await parcelFor(db, input, signal)
      if (!parcel.ok) return settled(parcel, '', PARCEL_FIELD)
      const opened = await openCase(
        db,
        actor,
        {
          locationText: input.locationText,
          ...(parcel.value === undefined ? {} : { parcelId: parcel.value }),
        },
        signal,
        new Date(),
        { reuseWithinSeconds: REPEAT_SUBMIT_WINDOW_SECONDS },
      )
      if (opened.ok) outcome.caseId = opened.value.caseId
      return settled(opened, 'Case opened.')
    },
  )
  if (result.ok && outcome.caseId !== undefined) redirect(`/staff/enforcement/${outcome.caseId}`)
  return result
}

export async function setCaseParcelAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SET_CASE_PARCEL_FORM, async ({ db, actor, signal }, input) =>
    settled(await setCaseParcel(db, actor, input, signal), 'Parcel linked.', PARCEL_FIELD),
  )
}

export async function staffComplaintAction(formData: FormData): Promise<ActionResult> {
  const outcome: { caseId?: string } = {}
  const result = await runStaffForm(
    formData,
    STAFF_COMPLAINT_FORM,
    async ({ db, actor, signal }, input) => {
      const parcel = await parcelFor(db, input, signal)
      if (!parcel.ok) return settled(parcel, '', PARCEL_FIELD)
      const recorded = await recordComplaint(
        db,
        actor,
        {
          channel: 'staff_entry',
          locationText: input.locationText,
          description: input.description,
          ...(parcel.value === undefined ? {} : { parcelId: parcel.value }),
          ...(input.name === null ? {} : { name: input.name }),
          ...(input.phone === null ? {} : { phone: input.phone }),
          ...(input.email === null ? {} : { email: input.email }),
        },
        signal,
      )
      if (recorded.ok) outcome.caseId = recorded.value.caseId
      return settled(recorded, 'Complaint recorded.')
    },
  )
  if (result.ok && outcome.caseId !== undefined) redirect(`/staff/enforcement/${outcome.caseId}`)
  return result
}

export async function setCaseStatusAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    SET_CASE_STATUS_FORM,
    async ({ db, actor, signal }, input) => {
      const changed = await setCaseStatus(
        db,
        actor,
        {
          caseId: input.caseId,
          to: input.to,
          expectedRowVersion: input.expectedRowVersion,
          ...(input.reason === null ? {} : { reason: input.reason }),
        },
        signal,
      )
      return settled(changed, 'Status changed.', {
        reason_required: 'reason',
        invalid_transition: 'to',
        finding_required: 'to',
      })
    },
  )
}
