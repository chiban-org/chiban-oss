import { z } from 'zod'
import { choice, civilDate, recordId, requiredText, wholeNumber } from '@/features/input/schemas'
import { ENTRY_KINDS } from '@/features/rosters/confirm'
import { RECHECK_MAX_DAYS, RECHECK_MIN_DAYS } from '@/features/rosters/recheckInterval'
import { ENDABLE_KINDS } from '@/features/rosters/rosterEnd'
import type { CivilDate } from '@/types/civilDate'

export const RESTRICTION_KINDS = [
  'conservation',
  'preservation',
  'agricultural_preservation',
] as const

const ADDRESS_MAX = 300

const parcelRef = () => requiredText('the parcel', { max: 200 })

const listedParcel = () => recordId('a parcel')

const asOf = (today: CivilDate) => civilDate('the date the list is current', { latest: today })

const associationFields = (today: CivilDate) => ({
  associationName: requiredText('the association name', { max: 200 }),
  asOf: asOf(today),
})

const parkFields = (today: CivilDate) => ({
  parkName: requiredText('the park name', { max: 200 }),
  ownerName: requiredText('the owner name', { max: 200 }),
  ownerMailingAddress: requiredText('the owner mailing address', { max: ADDRESS_MAX }),
  asOf: asOf(today),
})

const holderFields = () => ({
  holderName: requiredText('the holder name', { max: 200 }),
  holderMailingAddress: requiredText('the holder mailing address', { max: ADDRESS_MAX }),
  restrictionKind: choice('a kind', RESTRICTION_KINDS),
  recordedReference: requiredText('where it is recorded', { max: ADDRESS_MAX }),
})

const endedOn = (today: CivilDate) => civilDate('the end date', { latest: today })

export const addAssociationForm = (today: CivilDate) =>
  z.object({ parcelRef: parcelRef(), ...associationFields(today) })

export const updateAssociationForm = (today: CivilDate) =>
  z.object({ parcelId: listedParcel(), ...associationFields(today) })

export const addParkForm = (today: CivilDate) =>
  z.object({ parcelRef: parcelRef(), ...parkFields(today) })

export const updateParkForm = (today: CivilDate) =>
  z.object({ parcelId: listedParcel(), ...parkFields(today) })

export const ADD_RESTRICTION_FORM = z.object({ parcelRef: parcelRef(), ...holderFields() })

export const UPDATE_RESTRICTION_FORM = z.object({
  holdingId: recordId('a holder'),
  ...holderFields(),
})

export const endRestrictionForm = (today: CivilDate) =>
  z.object({ holdingId: recordId('a holder'), endedOn: endedOn(today) })

export const UNDO_RESTRICTION_END_FORM = z.object({ holdingId: recordId('a holder') })

export const NO_INPUT_FORM = z.object({})

export const endRosterEntryForm = (today: CivilDate) =>
  z.object({
    kind: choice('what to end', ENDABLE_KINDS),
    entryId: recordId('an entry'),
    endedOn: endedOn(today),
  })

export const UNDO_ROSTER_END_FORM = z.object({
  kind: choice('what to end', ENDABLE_KINDS),
  entryId: recordId('an entry'),
})

export const CONFIRM_ENTRY_FORM = z.object({
  kind: choice('what to confirm', ENTRY_KINDS),
  entryId: recordId('an entry'),
})

export const RECHECK_INTERVAL_FORM = z.object({
  days: wholeNumber('the number of days', { min: RECHECK_MIN_DAYS, max: RECHECK_MAX_DAYS }),
})
