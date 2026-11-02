import { type ActionResult, errorCopy, text } from '@/server/actionRunner'
import { parseCivilDate } from '@/types/civilDate'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const INVALID: ActionResult = { ok: false, error: errorCopy('invalid_input') }
export const INVALID_DATE: ActionResult = { ok: false, error: errorCopy('invalid_date') }

export function done(
  result: { ok: true } | { ok: false; error: string },
  message: string,
): ActionResult {
  return result.ok ? { ok: true, message } : { ok: false, error: errorCopy(result.error) }
}

export function idOf(formData: FormData, key = 'applicationId'): string | null {
  const value = text(formData, key)
  return UUID.test(value) ? value : null
}

export function dateOf(formData: FormData, key: string) {
  const parsed = parseCivilDate(text(formData, key))
  return parsed.ok ? parsed.value : null
}
