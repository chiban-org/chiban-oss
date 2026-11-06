import type { ActionResult } from '@/server/actionRunner'
import { refuseField } from '@/server/formInput'
import type { Result } from '@/types/result'
import { enforcementError } from './enforcementAction'

type Failure = Parameters<typeof enforcementError>[0]

export type FieldOf = Readonly<Record<string, string>>

export function settled(
  result: Result<unknown, Failure>,
  message: string,
  fieldOf: FieldOf = {},
): ActionResult {
  if (result.ok) return { ok: true, message }
  const copy = enforcementError(result.error)
  const field = typeof result.error === 'string' ? fieldOf[result.error] : undefined
  return field === undefined ? { ok: false, error: copy } : refuseField(field, copy)
}
