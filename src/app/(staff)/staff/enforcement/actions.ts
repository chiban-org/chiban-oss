'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import type { Db } from '@/db/client'
import { parcels } from '@/db/schema'
import {
  findParcel,
  type ParcelLookupError,
  parcelForLocation,
  setCaseParcel,
} from '@/features/enforcement/caseParcel'
import { openCase, setCaseStatus } from '@/features/enforcement/cases'
import { recordComplaint } from '@/features/enforcement/complaints'
import { REPEAT_SUBMIT_WINDOW_SECONDS } from '@/features/enforcement/openCaseReuse'
import { displayIdsFor } from '@/features/parcels/displayId'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { err, ok, type Result } from '@/types/result'
import {
  OPEN_CASE_FORM,
  SET_CASE_PARCEL_FORM,
  SET_CASE_STATUS_FORM,
  STAFF_COMPLAINT_FORM,
} from './caseForms'
import { settled } from './enforcementResult'

const PARCEL_FIELD = { parcel_not_found: 'parcelRef', parcel_ambiguous: 'parcelRef' }

const NO_LOCATION = 'Enter where the property is, or pick a parcel.'

interface Place {
  locationText: string
  parcelId: string | undefined
}

async function parcelFor(
  db: Db,
  input: { parcelRef: string | null; locationText: string | null },
  signal: AbortSignal,
): Promise<Result<string | undefined, ParcelLookupError>> {
  if (input.parcelRef === null) {
    return ok(await parcelForLocation(db, input.locationText ?? '', signal))
  }
  return await findParcel(db, input.parcelRef, signal)
}

async function parcelLocation(db: Db, parcelId: string | undefined): Promise<string | null> {
  if (parcelId === undefined) return null
  const [row] = await db
    .select({ siteAddress: parcels.siteAddress })
    .from(parcels)
    .where(eq(parcels.id, parcelId))
  const address = row?.siteAddress?.trim() ?? ''
  if (address !== '') return address
  return (await displayIdsFor(db, [parcelId])).get(parcelId) ?? null
}

async function placeFor(
  db: Db,
  input: { parcelRef: string | null; locationText: string | null },
  signal: AbortSignal,
): Promise<Result<Place, ParcelLookupError | 'no_location'>> {
  if (input.locationText === null && input.parcelRef === null) return err('no_location')
  const parcel = await parcelFor(db, input, signal)
  if (!parcel.ok) return parcel
  const locationText = input.locationText ?? (await parcelLocation(db, parcel.value))
  if (locationText === null) return err('no_location')
  return ok({ locationText, parcelId: parcel.value })
}

function placeRefusal(error: ParcelLookupError | 'no_location'): ActionResult {
  return error === 'no_location'
    ? refuseField('locationText', NO_LOCATION)
    : settled(err(error), '', PARCEL_FIELD)
}

export async function openCaseAction(formData: FormData): Promise<ActionResult> {
  const outcome: { caseId?: string } = {}
  const result = await runStaffForm(
    formData,
    OPEN_CASE_FORM,
    async ({ db, actor, signal }, input) => {
      const place = await placeFor(db, input, signal)
      if (!place.ok) return placeRefusal(place.error)
      const { locationText, parcelId } = place.value
      const opened = await openCase(
        db,
        actor,
        { locationText, ...(parcelId === undefined ? {} : { parcelId }) },
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
      const place = await placeFor(db, input, signal)
      if (!place.ok) return placeRefusal(place.error)
      const { locationText, parcelId } = place.value
      const recorded = await recordComplaint(
        db,
        actor,
        {
          channel: 'staff_entry',
          locationText,
          description: input.description,
          ...(parcelId === undefined ? {} : { parcelId }),
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
