import { z } from 'zod'
import { REDACTION_PURPOSES } from '@/db/schema'
import { inputField } from '@/features/input/field'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import { choice, recordId } from '@/features/input/schemas'
import { RECORDS_COPY } from '@/server/recordsAction'
import { err, ok } from '@/types/result'

const MAX_BOXES = 500
const UNREADABLE = 'The boxes could not be read. Draw them again.'

const boxes = () =>
  inputField((raw) => {
    const text = typeof raw === 'string' ? raw.trim() : ''
    if (text === '') return err(RECORDS_COPY.no_boxes ?? '')
    const parsed = safeParse(text)
    if (!Array.isArray(parsed)) return err(UNREADABLE)
    if (parsed.length === 0) return err(RECORDS_COPY.no_boxes ?? '')
    if (parsed.length > MAX_BOXES) return err(`Use ${MAX_BOXES} boxes or fewer.`)
    const records = parsed.filter(
      (box): box is Record<string, unknown> =>
        typeof box === 'object' && box !== null && !Array.isArray(box),
    )
    return records.length === parsed.length ? ok(records) : err(UNREADABLE)
  })

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const REDACT_FORM = z.object({
  documentId: recordId('a document'),
  sourceVersionId: recordId('a version'),
  purpose: choice('what the copy is for', REDACTION_PURPOSES),
  rtkRequestId: optionalRecordId('Choose a request.'),
  boxes: boxes(),
})
