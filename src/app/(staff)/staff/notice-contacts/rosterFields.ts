import type { DbOrTx } from '@/db/client'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { type ActionResult, text } from '@/server/actionRunner'
import type { CivilDate } from '@/types/civilDate'
import { isUuid } from '@/utils/uuid'

export const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function parcelOf(
  formData: FormData,
  db: DbOrTx,
  signal: AbortSignal,
): Promise<string | null> {
  const found = await resolveParcelId(db, { value: text(formData, 'parcelRef') }, signal)
  return found.ok ? found.value.parcelId : null
}

export function recordIdOf(formData: FormData, key: string): string | null {
  const value = text(formData, key)
  return isUuid(value) ? value : null
}

export function dateOf(formData: FormData, key: string): CivilDate | null {
  const value = text(formData, key)
  return DATE.test(value) ? (value as CivilDate) : null
}
