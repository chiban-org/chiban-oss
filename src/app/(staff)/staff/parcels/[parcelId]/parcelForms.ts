import { z } from 'zod'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import {
  choice,
  civilDate,
  optionalCivilDate,
  optionalText,
  recordId,
  requiredText,
} from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'

const MAX_ID_LIST = 2000
const MAX_REFERENCE = 200
const MAX_REASON = 1000
const MAX_ID = 100

export const lineageForm = (today: CivilDate) =>
  z.object({
    kind: choice('a kind of event', ['subdivision', 'lot_line_adjustment', 'merge'] as const),
    effectiveDate: civilDate('the effective date', { latest: today }),
    effectiveBasis: choice('a date basis', ['recording', 'approval'] as const),
    reference: optionalText('a recording reference', { max: MAX_REFERENCE }),
    parents: requiredText('at least one parent parcel', { max: MAX_ID_LIST }),
    children: requiredText('at least one child parcel', { max: MAX_ID_LIST }),
  })

export const aliasOverrideForm = (today: CivilDate) =>
  z
    .object({
      format: requiredText('an ID format', { max: MAX_ID }),
      value: requiredText('the ID', { max: MAX_ID }),
      parcelRef: optionalText('a parcel', { max: MAX_REFERENCE }),
      parcelId: optionalRecordId('Choose a parcel from the list.'),
      reason: requiredText('a reason', { max: MAX_REASON }),
      expiresOn: optionalCivilDate('the expiry date', { earliest: today }),
    })
    .superRefine((v, ctx) => {
      if (v.parcelRef === null && v.parcelId === null)
        ctx.addIssue({ code: 'custom', path: ['parcelRef'], message: 'Choose a parcel.' })
    })

export const carryForwardForm = z.object({
  linkId: recordId('a record'),
  toParcelId: recordId('a parcel'),
})

export const resolveUnresolvedForm = z.object({
  linkId: recordId('a record'),
  parcelRef: requiredText('a parcel', { max: MAX_REFERENCE }),
})
