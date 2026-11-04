import type { FieldType, FormField } from '@/features/forms/formSchema'

export const TYPE_WORDS: Record<FieldType, string> = {
  text: 'Short answer',
  textarea: 'Paragraph',
  integer: 'Whole number',
  decimal: 'Number',
  money: 'Money',
  date: 'Date',
  select: 'Dropdown',
  multiselect: 'Checkboxes',
  checkbox: 'Yes / No',
  email: 'Email',
  phone: 'Phone',
  section: 'Section',
}

export const PALETTE_ORDER: readonly FieldType[] = [
  'text',
  'textarea',
  'integer',
  'decimal',
  'money',
  'date',
  'select',
  'multiselect',
  'checkbox',
  'email',
  'phone',
  'section',
]

export const ANSWER_TYPE_CHOICES: readonly (readonly [FieldType, string])[] = PALETTE_ORDER.filter(
  (t) => t !== 'section',
).map((t) => [t, TYPE_WORDS[t]] as const)

export const FACT_CHOICES: readonly (readonly [string, string])[] = [
  ['', 'None'],
  ['classification', 'Use classification'],
  ['dwellingUnits', 'Number of dwelling units'],
  ['afterTheFact', 'Work started before the permit'],
]

export function hasChoices(field: FormField): boolean {
  return field.type === 'select' || field.type === 'multiselect'
}

export function isNumberQuestion(field: FormField): boolean {
  return field.type === 'integer' || field.type === 'decimal' || field.type === 'money'
}
