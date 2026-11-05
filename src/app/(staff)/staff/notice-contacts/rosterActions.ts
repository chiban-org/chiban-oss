'use server'

import { errorOrOk } from '@/features/boards/actionResult'
import { addAssociation, updateAssociation } from '@/features/rosters/associations'
import { officersFrom, tenantsFrom } from '@/features/rosters/contactForm'
import { addPark, updatePark } from '@/features/rosters/parks'
import { type ActionContext, type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import type { CivilDate } from '@/types/civilDate'
import { dateOf, INVALID, parcelOf, recordIdOf } from './rosterFields'

const PARCEL_AND_DATE: ActionResult = {
  ok: false,
  error: 'Choose a parcel and enter the date the list is current.',
}

interface Target {
  parcelId: string
  asOf: CivilDate
}

async function newParcel(formData: FormData, ctx: ActionContext): Promise<Target | ActionResult> {
  const parcelId = await parcelOf(formData, ctx.db, ctx.signal)
  const asOf = dateOf(formData, 'asOf')
  return parcelId === null || asOf === null ? PARCEL_AND_DATE : { parcelId, asOf }
}

function listedParcel(formData: FormData): Target | ActionResult {
  const parcelId = recordIdOf(formData, 'parcelId')
  const asOf = dateOf(formData, 'asOf')
  return parcelId === null || asOf === null ? INVALID : { parcelId, asOf }
}

function association(formData: FormData, target: Target) {
  return {
    ...target,
    associationName: text(formData, 'associationName'),
    officers: officersFrom(formData),
  }
}

function park(formData: FormData, target: Target) {
  return {
    ...target,
    parkName: text(formData, 'parkName'),
    ownerName: text(formData, 'ownerName'),
    ownerMailingAddress: text(formData, 'ownerMailingAddress'),
    tenants: tenantsFrom(formData),
  }
}

export async function addAssociationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) => {
    const target = await newParcel(formData, ctx)
    if (!('parcelId' in target)) return target
    const saved = await addAssociation(ctx.db, ctx.actor, association(formData, target), ctx.signal)
    return errorOrOk(saved, 'Association added.')
  })
}

export async function updateAssociationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) => {
    const target = listedParcel(formData)
    if (!('parcelId' in target)) return target
    const saved = await updateAssociation(
      ctx.db,
      ctx.actor,
      association(formData, target),
      ctx.signal,
    )
    return errorOrOk(saved, 'Association saved.')
  })
}

export async function addParkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) => {
    const target = await newParcel(formData, ctx)
    if (!('parcelId' in target)) return target
    const saved = await addPark(ctx.db, ctx.actor, park(formData, target), ctx.signal)
    return errorOrOk(saved, 'Park added.')
  })
}

export async function updateParkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) => {
    const target = listedParcel(formData)
    if (!('parcelId' in target)) return target
    const saved = await updatePark(ctx.db, ctx.actor, park(formData, target), ctx.signal)
    return errorOrOk(saved, 'Park saved.')
  })
}
