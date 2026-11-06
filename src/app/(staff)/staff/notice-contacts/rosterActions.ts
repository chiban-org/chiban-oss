'use server'

import { addAssociation, updateAssociation } from '@/features/rosters/associations'
import { officersFrom, tenantsFrom } from '@/features/rosters/contactForm'
import { addPark, updatePark } from '@/features/rosters/parks'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffFormToday } from '@/server/formInputToday'
import {
  addAssociationForm,
  addParkForm,
  updateAssociationForm,
  updateParkForm,
} from './noticeForms'
import { parcelFor } from './rosterFields'
import { settled } from './rosterResult'

const ASSOCIATION_FIELDS = {
  name_required: 'associationName',
  officers_required: 'officerName',
  association_exists: 'parcelRef',
}

const PARK_FIELDS = {
  owner_required: 'ownerName',
  tenants_required: 'tenantName',
  park_exists: 'parcelRef',
}

export async function addAssociationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    addAssociationForm,
    async ({ db, actor, signal }, { parcelRef, ...input }) => {
      const parcel = await parcelFor(db, parcelRef, signal)
      if (!('parcelId' in parcel)) return parcel
      const saved = await addAssociation(
        db,
        actor,
        { ...input, ...parcel, officers: officersFrom(formData) },
        signal,
      )
      return settled(saved, 'Association added.', ASSOCIATION_FIELDS)
    },
  )
}

export async function updateAssociationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    updateAssociationForm,
    async ({ db, actor, signal }, input) =>
      settled(
        await updateAssociation(db, actor, { ...input, officers: officersFrom(formData) }, signal),
        'Association saved.',
        ASSOCIATION_FIELDS,
      ),
  )
}

export async function addParkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    addParkForm,
    async ({ db, actor, signal }, { parcelRef, ...input }) => {
      const parcel = await parcelFor(db, parcelRef, signal)
      if (!('parcelId' in parcel)) return parcel
      const saved = await addPark(
        db,
        actor,
        { ...input, ...parcel, tenants: tenantsFrom(formData) },
        signal,
      )
      return settled(saved, 'Park added.', PARK_FIELDS)
    },
  )
}

export async function updateParkAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, updateParkForm, async ({ db, actor, signal }, input) =>
    settled(
      await updatePark(db, actor, { ...input, tenants: tenantsFrom(formData) }, signal),
      'Park saved.',
      PARK_FIELDS,
    ),
  )
}
