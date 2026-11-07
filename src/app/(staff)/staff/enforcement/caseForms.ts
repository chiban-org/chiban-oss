import { z } from 'zod'
import { ENFORCEMENT_STATUSES, NOTICE_METHODS, PROVISION_KINDS } from '@/db/schema'
import { MAX_COMPLAINT_CHARS } from '@/features/enforcement/complaints'
import { optionalEmail } from '@/features/input/optionalEmail'
import {
  choice,
  civilDate,
  optionalText,
  recordId,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'
import { recordIdList } from './inputFields'

const PARCEL = 'a parcel number or site address'
const MAX_ROW_VERSION = 2_147_483_647

export const rowVersion = () =>
  wholeNumber('the version of this record', { min: 1, max: MAX_ROW_VERSION })

export const OPEN_CASE_FORM = z.object({
  locationText: requiredText('where the property is', { max: 300 }),
  parcelRef: optionalText(PARCEL, { max: 200 }),
})

export const SET_CASE_PARCEL_FORM = z.object({
  caseId: recordId('a case'),
  parcelRef: requiredText(PARCEL, { max: 200 }),
})

export const STAFF_COMPLAINT_FORM = z.object({
  locationText: requiredText('where the property is', { max: 300 }),
  description: requiredText('what was reported', { max: MAX_COMPLAINT_CHARS }),
  parcelRef: optionalText(PARCEL, { max: 200 }),
  name: optionalText('the complainant name', { max: 200 }),
  phone: optionalText('the complainant phone number', { max: 40 }),
  email: optionalEmail('the complainant email'),
})

export const SET_CASE_STATUS_FORM = z.object({
  caseId: recordId('a case'),
  expectedRowVersion: rowVersion(),
  to: choice('a status', ENFORCEMENT_STATUSES),
  reason: optionalText('a reason', { max: 1000 }),
})

export const addNoteForm = (today: CivilDate) =>
  z.object({
    caseId: recordId('a case'),
    observedOn: civilDate('the date observed', { latest: today }),
    body: requiredText('a note', { max: 5000 }),
  })

export const recordFindingForm = (today: CivilDate) =>
  z.object({
    caseId: recordId('a case'),
    provisionKind: choice('what was violated', PROVISION_KINDS),
    provisionRef: requiredText('the section or condition', { max: 300 }),
    facts: requiredText('the facts', { max: 5000 }),
    inspectionDate: civilDate('the inspection date', { latest: today }),
  })

export const sendNoticeForm = (today: CivilDate) =>
  z.object({
    caseId: recordId('a case'),
    findingIds: recordIdList('Choose at least one finding.'),
    sentOn: civilDate('the date sent', { latest: today }),
    method: choice('how it was sent', NOTICE_METHODS),
  })

export const recordReceiptForm = (today: CivilDate) =>
  z.object({
    noticeId: recordId('a notice'),
    receivedOn: civilDate('the date received', { latest: today }),
    basis: requiredText('how receipt is known', { max: 500 }),
  })

export const COMPLAINT_PUBLIC_TEXT_FORM = z.object({
  complaintId: recordId('a complaint'),
  text: requiredText('the public text', { max: 5000 }),
})

export const PUBLISH_CASE_FORM = z.object({
  caseId: recordId('a case'),
  summary: requiredText('a public summary', { max: 1000 }),
})

export const UNPUBLISH_CASE_FORM = z.object({ caseId: recordId('a case') })
