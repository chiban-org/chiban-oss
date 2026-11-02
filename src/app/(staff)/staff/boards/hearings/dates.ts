import { text } from '@/server/actionRunner'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'

export function dateOf(formData: FormData, key: string): CivilDate | null {
  const parsed = parseCivilDate(text(formData, key))
  return parsed.ok ? parsed.value : null
}
