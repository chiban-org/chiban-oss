import type { DocumentItem } from '@/features/applications/documentItemSchema'
import type { Condition, Leaf } from '@/features/forms/condition'
import type { FormField } from '@/features/forms/formSchema'

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
]

export const IS_OWNER: FormField = {
  key: 'is_owner',
  label: 'Are you the property owner?',
  type: 'select',
  required: false,
  options: YES_NO,
}

export const TOWN_SEWER: FormField = {
  key: 'town_sewer',
  label: 'Is the lot served by town sewer?',
  type: 'select',
  required: false,
  options: YES_NO,
}

export function yesBox(key: string, label: string): FormField {
  return { key, label, type: 'checkbox', required: false }
}

export const NEAR_WATER = yesBox(
  'near_water',
  'The work is within 250 feet of a lake, pond or river',
)
export const WETLANDS_WORK = yesBox('wetlands_work', 'The work is in or next to wetlands')
export const NEW_DWELLING = yesBox('new_dwelling', 'This creates a new dwelling')
export const SEPTIC_SYSTEM = yesBox('septic_system', 'The building uses a septic system')

export const NOT_OWNER: Condition = { field: 'is_owner', op: 'equals', value: 'no' }

export function when(field: string): Leaf {
  return { field, op: 'is_true' }
}

export function doc(
  key: string,
  label: string,
  rest: Partial<Omit<DocumentItem, 'key' | 'label'>> = {},
): DocumentItem {
  return { key, label, stage: 'to_file', waivable: false, ...rest }
}

export const OWNER_AUTHORIZATION_LETTER = doc('owner_authorization_letter', 'Owner authorization', {
  help: 'A signed letter from the owner allowing you to apply.',
  requiredIf: NOT_OWNER,
})

export const PLOT_PLAN = doc('plot_plan', 'Plot plan', {
  help: 'Show lot lines, buildings, setbacks, wetlands within 100 feet, and any shoreline.',
})
