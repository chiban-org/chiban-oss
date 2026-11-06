import { z } from 'zod'
import { choice, inputField, recordId, requiredText } from '@/features/input/schemas'
import { err, ok, type Result } from '@/types/result'

const REASON_MAX = 1000

const listId = () => recordId('a list')

const reason = () => requiredText('a reason', { max: REASON_MAX })

const yesNo = (noun: string) =>
  inputField((raw): Result<boolean, string> => {
    const value = typeof raw === 'string' ? raw.trim() : ''
    return value === 'yes' || value === 'no' ? ok(value === 'yes') : err(`Choose ${noun}.`)
  })

export const PROFESSIONS = ['engineer', 'architect', 'land_surveyor', 'soil_scientist'] as const

export const GENERATE_LIST_FORM = z.object({ applicationId: recordId('an application') })

export const SELECT_PARCEL_FORM = z.object({
  listId: listId(),
  parcelRef: requiredText('the parcel', { max: 200 }),
  crossing: choice('street or stream', ['street', 'stream'] as const),
  note: requiredText('why this parcel belongs on the list', { max: REASON_MAX }),
})

export const EXCLUDE_CANDIDATE_FORM = z.object({
  listId: listId(),
  parcelId: recordId('a parcel'),
  reason: reason(),
})

export const CORRECT_RECIPIENT_FORM = z.object({
  listId: listId(),
  recipientId: recordId('a recipient'),
  name: requiredText('the name', { max: 200 }),
  mailingAddress: requiredText('the mailing address', { max: 300 }),
  reason: reason(),
})

export const DECIDE_TENANT_FORM = z.object({
  listId: listId(),
  recipientId: recordId('a recipient'),
  qualifies: yesNo('whether this tenant counts'),
  reason: reason(),
})

export const LIST_ONLY_FORM = z.object({ listId: listId() })

export const ADD_PROFESSIONAL_FORM = z.object({
  applicationId: recordId('an application'),
  name: requiredText('the name', { max: 200 }),
  profession: choice('a profession', PROFESSIONS),
  businessAddress: requiredText('the business address', { max: 300 }),
  sealOnPlat: yesNo('whether the seal is on the plat'),
})
