import { z } from 'zod'
import { blankAsNull, inputField, trimmed } from '@/features/input/field'
import {
  optionalCivilDate,
  optionalPhone,
  optionalText,
  recordId,
  requiredText,
} from '@/features/input/schemas'
import type { RequestInspectionInput } from '@/features/inspections/types'
import { err, ok } from '@/types/result'
import { isUuid } from '@/utils/uuid'

const NO_PREFERENCE = 'any'

export const CONTACT_NAME_MAX = 200
export const ACCESS_NOTES_MAX = 1000

const optionalRecordId = (noun: string) =>
  inputField(
    blankAsNull((raw) => (isUuid(trimmed(raw)) ? ok(trimmed(raw)) : err(`Choose ${noun}.`))),
  )

export const PortalRequestForm = z.object({
  applicationId: recordId('an application'),
  checklistVersionId: recordId('an inspection'),
  preferredDate: z.preprocess(
    (raw) => (raw === NO_PREFERENCE ? undefined : raw),
    optionalCivilDate('a preferred day'),
  ),
  contactName: requiredText('a contact name', { max: CONTACT_NAME_MAX }),
  contactPhone: optionalPhone('a contact phone'),
  accessNotes: optionalText('access notes', { max: ACCESS_NOTES_MAX }),
  reinspectionOf: optionalRecordId('a failed inspection'),
})

export function portalRequestInput(
  form: z.output<typeof PortalRequestForm>,
): RequestInspectionInput {
  const { preferredDate, contactPhone, accessNotes, reinspectionOf, ...rest } = form
  return {
    ...rest,
    channel: 'portal',
    ...(preferredDate === null ? {} : { preferredDate }),
    ...(contactPhone === null ? {} : { contactPhone }),
    ...(accessNotes === null ? {} : { accessNotes }),
    ...(reinspectionOf === null ? {} : { reinspectionOf }),
  }
}
