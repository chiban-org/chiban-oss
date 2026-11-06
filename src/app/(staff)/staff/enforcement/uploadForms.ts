import { z } from 'zod'
import { TITLE_MAX } from '@/features/documents/uploadLimits'
import { choice, optionalText, recordId, requiredText, wholeNumber } from '@/features/input/schemas'

export const CASE_UPLOAD_KINDS = [
  'enforcement_photo',
  'enforcement_letter',
  'service_proof',
  'court_document',
] as const

export const CASE_UPLOAD_INTENT_FORM = z.object({
  targetId: recordId('a case'),
  docKind: choice('a kind of document', CASE_UPLOAD_KINDS),
  title: optionalText('a title', { max: TITLE_MAX }),
  filename: requiredText('a file name', { max: 255 }),
  contentType: requiredText('a file type', { max: 100 }),
  sizeBytes: wholeNumber('the file size', { min: 0, max: Number.MAX_SAFE_INTEGER }),
})

export const CASE_UPLOAD_FINALIZE_FORM = z.object({ intentId: recordId('an upload') })
