import { CSRF_FIELD } from '@/server/actionGuard'

export type FieldValue = string | number | File | readonly string[]
export type Fields = Readonly<Record<string, FieldValue | undefined>>

export function buildForm(fields: Fields, csrfToken: string | null): FormData {
  const form = new FormData()
  if (csrfToken !== null) form.set(CSRF_FIELD, csrfToken)
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (typeof value === 'string' || value instanceof File) form.append(name, value)
    else if (typeof value === 'number') form.append(name, String(value))
    else for (const item of value) form.append(name, item)
  }
  return form
}
