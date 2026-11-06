'use server'

import { endRestriction, undoRestrictionEnd } from '@/features/rosters/restrictionEnd'
import { addRestriction, updateRestriction } from '@/features/rosters/restrictions'
import { recordRosterReview } from '@/features/rosters/reviews'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import {
  ADD_RESTRICTION_FORM,
  endRestrictionForm,
  NO_INPUT_FORM,
  UNDO_RESTRICTION_END_FORM,
  UPDATE_RESTRICTION_FORM,
} from './noticeForms'
import { parcelFor } from './rosterFields'
import { settled } from './rosterResult'

const HOLDER_FIELDS = { holder_required: 'holderName', address_required: 'holderMailingAddress' }

export async function addRestrictionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    ADD_RESTRICTION_FORM,
    async ({ db, actor, signal }, { parcelRef, ...input }) => {
      const parcel = await parcelFor(db, parcelRef, signal)
      if (!('parcelId' in parcel)) return parcel
      const added = await addRestriction(db, actor, { ...input, ...parcel }, signal)
      return settled(added, 'Restriction holder added.', HOLDER_FIELDS)
    },
  )
}

export async function updateRestrictionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    UPDATE_RESTRICTION_FORM,
    async ({ db, actor, signal }, input) =>
      settled(
        await updateRestriction(db, actor, input, signal),
        'Restriction holder saved.',
        HOLDER_FIELDS,
      ),
  )
}

export async function endRestrictionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    endRestrictionForm,
    async ({ db, actor, signal }, input) =>
      settled(await endRestriction(db, actor, input, signal), 'Restriction ended.'),
  )
}

export async function undoRestrictionEndAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    UNDO_RESTRICTION_END_FORM,
    async ({ db, actor, signal }, input) =>
      settled(await undoRestrictionEnd(db, actor, input, signal), 'The ending was undone.'),
  )
}

export async function recordLandRecordsCheckAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    () => NO_INPUT_FORM,
    async ({ db, actor, signal }, _input, today) =>
      settled(
        await recordRosterReview(db, actor, { kind: 'restrictions', reviewedOn: today }, signal),
        'Land records check recorded.',
      ),
  )
}
