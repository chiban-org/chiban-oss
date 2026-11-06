import { BoardSchema } from '@packs/nh/schema'
import { z } from 'zod'
import {
  choice,
  civilDate,
  optionalCivilDate,
  optionalText,
  recordId,
  requiredText,
} from '@/features/input/schemas'
import { valueList, yesFlag } from './formFields'

const applicationId = () => recordId('an application')

export const MEETING_KINDS = ['regular', 'special'] as const

export const SCHEDULE_MEETING_FORM = z.object({
  board: choice('a board', BoardSchema.options),
  meetingDate: civilDate('the meeting date'),
  kind: choice('a kind of meeting', MEETING_KINDS),
  location: optionalText('a location', { max: 200 }),
})

export const CANCEL_MEETING_FORM = z.object({
  meetingId: recordId('a meeting'),
  reason: requiredText('a reason', { max: 500 }),
  tellRecipients: yesFlag(),
})

export const ACCEPTANCE_MEETING_FORM = z.object({
  applicationId: applicationId(),
  meetingId: recordId('a meeting'),
})

export const COMPLETENESS_VOTE_FORM = z.object({
  applicationId: applicationId(),
  meetingId: recordId('a meeting'),
  votedOn: civilDate('the date of the vote'),
  outcome: choice('an outcome', ['accepted', 'not_accepted'] as const),
  reason: optionalText('a reason', { max: 1000 }),
})

export const CERTIFICATION_FORM = z.object({
  applicationId: applicationId(),
  requestedOn: civilDate('the date requested'),
  outcome: choice('an outcome', ['pending', 'certified', 'refused'] as const),
  decidedOn: optionalCivilDate('the date decided'),
})

export const REGIONAL_IMPACT_FORM = z.object({
  applicationId: applicationId(),
  determination: choice('a determination', ['yes', 'no', 'previously_determined'] as const),
  municipalityKeys: valueList(),
  previousBoardRef: optionalText('the board reference', { max: 200 }),
})

export const DES_FORM = z.object({
  applicationId: applicationId(),
  determination: choice('a determination', [
    'within_500ft',
    'not_within',
    'not_applicable',
  ] as const),
  reason: optionalText('a reason', { max: 1000 }),
})

export const FINAL_APPROVAL_FORM = z.object({
  applicationId: applicationId(),
  finalOn: civilDate('the date of final approval'),
})

export const TERMINATE_UNPAID_FORM = z.object({
  applicationId: applicationId(),
  reason: requiredText('a reason', { max: 1000 }),
})

export const APPLICANT_PARCEL_FORM = z.object({
  applicationId: applicationId(),
  parcelRef: requiredText('a parcel number or address', { max: 200 }),
})
