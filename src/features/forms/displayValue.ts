import type { FormField } from '@/features/forms/formSchema'
import type { FieldValue } from '@/features/forms/validateSubmission'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'

const CENTS_PER_DOLLAR = 100

function optionLabel(field: FormField, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value
}

export function displayFieldValue(field: FormField, value: FieldValue): string {
  if (Array.isArray(value)) return value.map((v) => optionLabel(field, v)).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (field.type === 'money') {
    const dollars = Number(value)
    return Number.isFinite(dollars)
      ? formatCents(Math.round(dollars * CENTS_PER_DOLLAR))
      : String(value)
  }
  if (field.type === 'date' && typeof value === 'string') return formatCivilDate(value)
  return optionLabel(field, String(value))
}
