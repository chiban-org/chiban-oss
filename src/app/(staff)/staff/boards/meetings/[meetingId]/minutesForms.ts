import { z } from 'zod'
import { MINUTES_STATUSES } from '@/features/boards/minutes'
import {
  choice,
  optionalCivilDate,
  optionalText,
  recordId,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'

export const UPLOAD_INTENT_FORM = z.object({
  targetId: recordId('a meeting'),
  title: optionalText('a title', { max: 200 }),
  filename: requiredText('a file name', { max: 255 }),
  contentType: requiredText('a file type', { max: 100 }),
  sizeBytes: wholeNumber('the file size', { min: 0, max: Number.MAX_SAFE_INTEGER }),
})

export const FINALIZE_UPLOAD_FORM = z.object({ intentId: recordId('an upload') })

export const RECORD_MINUTES_FORM = z.object({
  meetingId: recordId('a meeting'),
  documentId: recordId('the minutes'),
  status: choice('a status', MINUTES_STATUSES),
  approvedOn: optionalCivilDate('the date approved'),
})
