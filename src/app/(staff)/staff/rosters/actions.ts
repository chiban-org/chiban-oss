'use server'

import { errorOrOk } from '@/features/boards/actionResult'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { upsertAssociation } from '@/features/rosters/associations'
import { upsertPark } from '@/features/rosters/parks'
import { parseOfficers, parseTenants } from '@/features/rosters/parseLines'
import { addRestriction, endRestriction } from '@/features/rosters/restrictions'
import { recordRosterReview } from '@/features/rosters/reviews'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import type { CivilDate } from '@/types/civilDate'

const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const DATE = /^\d{4}-\d{2}-\d{2}$/
const KINDS = ['condo', 'park', 'restrictions', 'regional_contacts'] as const
const RESTRICTIONS = ['conservation', 'preservation', 'agricultural_preservation'] as const

async function parcelOf(
  formData: FormData,
  db: Parameters<typeof resolveParcelId>[0],
  signal: AbortSignal,
): Promise<string | null> {
  const found = await resolveParcelId(db, { value: text(formData, 'parcelRef') }, signal)
  return found.ok ? found.value.parcelId : null
}

function dateOf(formData: FormData, key: string): CivilDate | null {
  const value = text(formData, key)
  return DATE.test(value) ? (value as CivilDate) : null
}

export async function upsertAssociationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const parcelId = await parcelOf(formData, db, signal)
    const asOf = dateOf(formData, 'asOf')
    if (parcelId === null || asOf === null)
      return {
        ok: false,
        error: 'Enter a parcel ID that exists and the date the roster is current.',
      }
    const saved = await upsertAssociation(
      db,
      actor,
      {
        parcelId,
        associationName: text(formData, 'associationName'),
        officers: parseOfficers(text(formData, 'officers')),
        asOf,
      },
      signal,
    )
    return errorOrOk(saved, 'Association roster saved.')
  })
}

export async function upsertParkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const parcelId = await parcelOf(formData, db, signal)
    const asOf = dateOf(formData, 'asOf')
    if (parcelId === null || asOf === null)
      return {
        ok: false,
        error: 'Enter a parcel ID that exists and the date the roster is current.',
      }
    const saved = await upsertPark(
      db,
      actor,
      {
        parcelId,
        parkName: text(formData, 'parkName'),
        ownerName: text(formData, 'ownerName'),
        ownerMailingAddress: text(formData, 'ownerMailingAddress'),
        tenants: parseTenants(text(formData, 'tenants')),
        asOf,
      },
      signal,
    )
    return errorOrOk(saved, 'Park roster saved.')
  })
}

export async function addRestrictionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const parcelId = await parcelOf(formData, db, signal)
    const kind = text(formData, 'restrictionKind')
    if (parcelId === null) {
      return {
        ok: false,
        error: `No parcel has the ID ${text(formData, 'parcelRef')}. Check the parcel ID and try again.`,
      }
    }
    if (!(RESTRICTIONS as readonly string[]).includes(kind)) return INVALID
    const added = await addRestriction(
      db,
      actor,
      {
        parcelId,
        holderName: text(formData, 'holderName'),
        holderMailingAddress: text(formData, 'holderMailingAddress'),
        restrictionKind: kind as (typeof RESTRICTIONS)[number],
        recordedReference: text(formData, 'recordedReference'),
      },
      signal,
    )
    return errorOrOk(added, 'Restriction holder added.')
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
