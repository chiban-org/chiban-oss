import { z } from 'zod'
import { CONFIG_KINDS } from '@/features/config/kinds'
import { trimmed } from '@/features/input/field'
import {
  checkbox,
  choice,
  civilDate,
  inputField,
  optionalCivilDate,
  optionalText,
  requiredText,
  wholeNumber,
} from '@/features/input/schemas'
import { err, ok } from '@/types/result'

export const MAX_KEY_LENGTH = 64
export const MAX_NAME_LENGTH = 200

const UNREADABLE_BODY = 'The settings could not be read. Reload the page and try again.'

export function jsonBody() {
  return inputField((raw) => {
    if (typeof raw !== 'string') return err(UNREADABLE_BODY)
    try {
      return ok(JSON.parse(raw) as unknown)
    } catch {
      return err(UNREADABLE_BODY)
    }
  })
}

const kind = () => choice('a kind of setting', CONFIG_KINDS)
const key = () => requiredText('a short name', { max: MAX_KEY_LENGTH })

export const DRAFT_FORM = z.object({ kind: kind(), key: key(), body: jsonBody() })

export const SETTINGS_BODY_FORM = z.object({ body: jsonBody() })

export const DISCARD_FORM = z.object({ kind: kind(), key: key() })

export const ROLLBACK_FORM = z.object({
  kind: kind(),
  key: key(),
  toVersion: wholeNumber('a version', { min: 1, max: 1_000_000 }),
})

export const START_DRAFT_FORM = z.object({
  kind: kind(),
  key: optionalText('a short name', { max: MAX_KEY_LENGTH }),
  label: optionalText('a name', { max: MAX_NAME_LENGTH }),
})

export const ADOPT_STARTER_FORM = z.object({ starterId: requiredText('a starter', { max: 100 }) })

export const NO_FIELDS = z.object({})

export const PREVIEW_WORKFLOW_FORM = z.object({
  key: key(),
  body: jsonBody(),
  previewReceived: civilDate('the received date'),
  previewAccepted: optionalCivilDate('the accepted date'),
  previewMeeting: optionalCivilDate('the meeting date'),
  previewRegionalImpact: checkbox(),
})

export const TOWN_SECTION_FORM = z.object({
  section: requiredText('a section', { max: 50 }),
  body: jsonBody(),
})

export const TEMPLATE_SAMPLES_FORM = z.object({ templateKind: requiredText('a kind of document') })

export const TEMPLATE_PREVIEW_FORM = z.object({
  body: jsonBody(),
  recordId: inputField((raw) => ok(trimmed(raw))),
})

export const TOWN_IMAGE_FORM = z.object({
  file: inputField((raw) =>
    raw instanceof File && raw.size > 0 ? ok(raw) : err('Choose an image to upload.'),
  ),
})
