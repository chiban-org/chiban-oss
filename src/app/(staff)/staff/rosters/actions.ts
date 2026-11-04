'use server'

import { errorOrOk } from '@/features/boards/actionResult'
import {
  addRestriction,
  endRestriction,
  type RestrictionKind,
  updateRestriction,
} from '@/features/rosters/restrictions'
import { recordRosterReview } from '@/features/rosters/reviews'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import { dateOf, INVALID, parcelOf, recordIdOf } from './rosterFields'

const KINDS = ['condo', 'park', 'restrictions', 'regional_contacts'] as const
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
    const endedOn = dateOf(formData, 'endedOn')
    if (endedOn === null) return INVALID
    return errorOrOk(
      await endRestriction(db, actor, { holdingId: text(formData, 'holdingId'), endedOn }, signal),
      'Restriction ended.',
    )
  })
}

export async function recordReviewAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = text(formData, 'kind')
    const reviewedOn = dateOf(formData, 'reviewedOn')
    if (reviewedOn === null || !(KINDS as readonly string[]).includes(kind)) return INVALID
    return errorOrOk(
      await recordRosterReview(
        db,
        actor,
        { kind: kind as (typeof KINDS)[number], reviewedOn },
        signal,
      ),
      'Review recorded.',
    )
  })
}
