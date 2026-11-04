import type { FormField } from '@/features/forms/formSchema'

export function isAddressQuestion(field: Pick<FormField, 'key' | 'label' | 'type'>): boolean {
  if (field.type !== 'text' && field.type !== 'textarea') return false
  return field.key.endsWith('mailing_address') || /mailing address/i.test(field.label)
}
