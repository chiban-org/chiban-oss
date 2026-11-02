import type { FormBody } from '@/features/forms/formSchema'
import type { FieldErrorCode } from '@/features/forms/validateSubmission'

export function rawValuesFromForm(formData: FormData, form: FormBody): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of form.fields) {
    if (field.staffOnly === true || !formData.has(field.key)) continue
    if (field.type === 'multiselect') out[field.key] = formData.getAll(field.key)
    else if (field.type === 'checkbox') out[field.key] = formData.get(field.key) === 'true'
    else out[field.key] = formData.get(field.key)
  }
  return out
}

const COPY: Record<FieldErrorCode, string> = {
  required: 'This is required.',
  type: 'Enter a valid value.',
  min: 'That is below the allowed minimum.',
  max: 'That is above the allowed maximum.',
  min_length: 'That is too short.',
  max_length: 'That is too long.',
  option: 'Choose one of the listed options.',
  staff_only: 'The town fills this in.',
}

export function fieldErrorCopy(code: FieldErrorCode): string {
  return COPY[code]
}
