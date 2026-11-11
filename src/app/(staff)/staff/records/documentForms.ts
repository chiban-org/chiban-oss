import { z } from 'zod'
import { ITEM_KEY_MAX } from '@/features/applications/documentItemSchema'
import { AUDIENCES } from '@/features/documents/types'
import { FILENAME_MAX, TITLE_MAX } from '@/features/documents/uploadLimits'
import { inputField } from '@/features/input/field'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import {
  checkbox,
  choice,
  civilDate,
  optionalChoice,
  optionalText,
  recordId,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'
import { err, ok } from '@/types/result'

const MIN_REASON = 10
const MAX_REASON = 2000
const MAX_REFERENCE = 300
const SERIES_MAX = 100
const CONTENT_TYPE_MAX = 200
const AUDIENCE_PROBLEM = 'Choose from the audiences listed.'
const NAME_A_RECORD =
  'Enter the application number, case number, request number, project title, or document title.'

const audiences = () =>
  inputField((raw) => {
    const values = (Array.isArray(raw) ? raw : [raw]).filter(
      (v) => typeof v === 'string' && v.trim() !== '',
    ) as string[]
    const known: readonly string[] = AUDIENCES
    return values.every((v) => known.includes(v))
      ? ok([...new Set(values)] as (typeof AUDIENCES)[number][])
      : err(AUDIENCE_PROBLEM)
  })

export const AUDIENCES_FORM = z.object({
  documentId: recordId('a document'),
  audience: audiences(),
})

export const PUBLIC_FORM = z.object({ documentId: recordId('a document'), isPublic: checkbox() })

export const SERIES_FORM = z.object({
  documentId: recordId('a document'),
  seriesKey: requiredText('a record series', { max: SERIES_MAX }),
})

export const RETRY_FORM = z.object({ recordId: recordId('a preservation record') })

const reason = () => requiredText('a reason', { min: MIN_REASON, max: MAX_REASON })

export const PLACE_HOLD_FORM = z
  .object({
    targetKind: choice('what to hold', [
      'project',
      'application',
      'document',
      'enforcement_case',
      'rtk_request',
    ] as const),
    targetRef: optionalText('a reference', { max: MAX_REFERENCE }),
    targetId: optionalRecordId('Choose a record to hold.'),
    reason: reason(),
  })
  .superRefine((v, ctx) => {
    if (v.targetRef === null && v.targetId === null)
      ctx.addIssue({ code: 'custom', path: ['targetRef'], message: NAME_A_RECORD })
  })

export const RELEASE_HOLD_FORM = z.object({ holdId: recordId('a hold'), reason: reason() })

export const buildingRemovedForm = (today: CivilDate) =>
  z.object({
    projectId: recordId('a project'),
    occurredOn: civilDate('the date the building was removed', { latest: today }),
  })

export const UPLOAD_INTENT_FORM = z.object({
  targetKind: choice('where to attach the file', ['parcel', 'project', 'application'] as const),
  targetId: recordId('a record'),
  title: optionalText('a title', { max: TITLE_MAX }),
  filename: requiredText('a file name', { max: FILENAME_MAX }),
  contentType: requiredText('a file type', { max: CONTENT_TYPE_MAX }),
  sizeBytes: wholeNumber('the file size', { min: 0, max: Number.MAX_SAFE_INTEGER }),
  seriesKey: optionalText('a record series', { max: SERIES_MAX }),
  itemKey: optionalText('a required document', { max: ITEM_KEY_MAX }),
})

export const FINALIZE_FORM = z.object({
  intentId: recordId('an upload'),
  visibility: optionalChoice('who can see the file', ['public', 'private'] as const),
})

export const REDACTED_FORM = z.object({
  documentId: recordId('a document'),
  intentId: recordId('an upload'),
})
