'use server'

import { errorOrOk } from '@/features/boards/actionResult'
import { endRestriction, undoRestrictionEnd } from '@/features/rosters/restrictionEnd'
import {
  addRestriction,
  type RestrictionKind,
  updateRestriction,
} from '@/features/rosters/restrictions'
import { recordRosterReview } from '@/features/rosters/reviews'
import { townToday } from '@/features/town/today'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import { dateOf, INVALID, parcelOf, recordIdOf } from './rosterFields'

const RESTRICTIONS: readonly RestrictionKind[] = [
  'conservation',
  'preservation',
  'agricultural_preservation',
]

function restrictionKindOf(formData: FormData): RestrictionKind | null {
  const kind = text(formData, 'restrictionKind')
  return RESTRICTIONS.find((k) => k === kind) ?? null
}

function holder(formData: FormData) {
  return {
    holderName: text(formData, 'holderName'),
    holderMailingAddress: text(formData, 'holderMailingAddress'),
    recordedReference: text(formData, 'recordedReference'),
  }
}

export async function addRestrictionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const parcelId = await parcelOf(formData, db, signal)
    const restrictionKind = restrictionKindOf(formData)
    if (parcelId === null) {
      return {
        ok: false,
        error: `No parcel has the ID ${text(formData, 'parcelRef')}. Check the parcel ID and try again.`,
      }
    }
    if (restrictionKind === null) return INVALID
    const added = await addRestriction(
      db,
      actor,
      { parcelId, restrictionKind, ...holder(formData) },
      signal,
    )
    return errorOrOk(added, 'Restriction holder added.')
  })
}

export async function updateRestrictionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const holdingId = recordIdOf(formData, 'holdingId')
    const restrictionKind = restrictionKindOf(formData)
    if (holdingId === null || restrictionKind === null) return INVALID
    const saved = await updateRestriction(
      db,
      actor,
      { holdingId, restrictionKind, ...holder(formData) },
      signal,
    )
    return errorOrOk(saved, 'Restriction holder saved.')
  })
}

export async function endRestrictionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const holdingId = recordIdOf(formData, 'holdingId')
    const endedOn = dateOf(formData, 'endedOn')
    if (holdingId === null || endedOn === null) return INVALID
    return errorOrOk(
      await endRestriction(db, actor, { holdingId, endedOn }, signal),
      'Restriction ended.',
    )
  })
}

export async function undoRestrictionEndAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const holdingId = recordIdOf(formData, 'holdingId')
    if (holdingId === null) return INVALID
    return errorOrOk(
      await undoRestrictionEnd(db, actor, { holdingId }, signal),
      'The ending was undone.',
    )
  })
}

export async function recordLandRecordsCheckAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const reviewedOn = await townToday(db, new Date(), signal)
    return errorOrOk(
      await recordRosterReview(db, actor, { kind: 'restrictions', reviewedOn }, signal),
      'Land records check recorded.',
    )
  })
}
