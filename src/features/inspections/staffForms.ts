import { z } from 'zod'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import {
  choice,
  civilDate,
  optionalCivilDate,
  optionalPhone,
  optionalText,
  recordId,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'

const MAX_ROW_VERSION = 2_147_483_647
const MINUTES_PER_DAY = 1440
const NO_PREFERENCE = 'any'

const rowVersion = () =>
  wholeNumber('the version of the inspection', { min: 1, max: MAX_ROW_VERSION })

const preferredDay = z.preprocess(
  (raw) => (typeof raw === 'string' && raw.trim() === NO_PREFERENCE ? undefined : raw),
  optionalCivilDate('the preferred day'),
)

export const STAFF_REQUEST_FORM = z.object({
  applicationId: recordId('a permit'),
  checklistVersionId: recordId('an inspection'),
  channel: choice('how the request came in', ['phone', 'counter'] as const),
  preferredDate: preferredDay,
  contactName: requiredText('the contact name', { max: 200 }),
  contactPhone: optionalPhone('the contact phone'),
  accessNotes: optionalText('the access notes', { max: 1000 }),
  reinspectionOf: optionalRecordId('Choose the failed inspection to inspect again.'),
})

export const SCHEDULE_FORM = z.object({
  inspectionId: recordId('an inspection'),
  inspectorUserId: recordId('an inspector'),
  date: civilDate('the date'),
  startMinute: wholeNumber('the start time', { min: 0, max: MINUTES_PER_DAY - 1 }),
  expectedRowVersion: rowVersion(),
  offGridReason: optionalText('the reason', { max: 500 }),
})

export const CANCEL_FORM = z.object({
  inspectionId: recordId('an inspection'),
  expectedRowVersion: rowVersion(),
})

export function certificateForm(today: CivilDate) {
  return z.object({
    applicationId: recordId('a permit'),
    issuedOn: civilDate('the issue date', { latest: today }),
    expectedRowVersion: wholeNumber('the version of the permit', {
      min: 1,
      max: MAX_ROW_VERSION,
    }),
  })
}
