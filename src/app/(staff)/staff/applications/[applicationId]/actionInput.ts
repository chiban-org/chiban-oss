import { z } from 'zod'
import { optionalText, recordId, wholeNumber } from '@/features/input/schemas'
import { type ActionResult, errorCopy, text } from '@/server/actionRunner'
import { refuseField } from '@/server/formInput'

const MAX_ROW_VERSION = 2_147_483_647

export const applicationIdField = () => recordId('an application')

export const rowVersionField = () =>
  wholeNumber('the version of the application', { min: 1, max: MAX_ROW_VERSION })

export const APPLICATION_FORM = z.object({ applicationId: applicationIdField() })

export const optionalReference = (noun: string) => optionalText(noun, { max: 200 })

export type FieldOf = Readonly<Record<string, string>>

export function outcome(
  result: { ok: true } | { ok: false; error: string },
  message: string,
  fieldOf: FieldOf = {},
): ActionResult {
  if (result.ok) return { ok: true, message }
  const copy = errorCopy(result.error)
  const field = fieldOf[result.error]
  return field === undefined ? { ok: false, error: copy } : refuseField(field, copy)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const INVALID: ActionResult = { ok: false, error: errorCopy('invalid_input') }

export function idOf(formData: FormData, key = 'applicationId'): string | null {
  const value = text(formData, key)
  return UUID.test(value) ? value : null
}
