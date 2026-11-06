import { boardErrorCopy } from '@/features/boards/errorCopy'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField } from '@/server/formInput'

export type FieldOf = Readonly<Record<string, string>>

export function settled(
  result: { ok: true } | { ok: false; error: unknown },
  message: string,
  fieldOf: FieldOf = {},
): ActionResult {
  if (result.ok) return { ok: true, message }
  const copy = boardErrorCopy(result.error)
  const field = typeof result.error === 'string' ? fieldOf[result.error] : undefined
  return field === undefined ? { ok: false, error: copy } : refuseField(field, copy)
}
