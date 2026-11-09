import { describe, expect, it } from 'vitest'
import type { FormField } from '@/features/forms/formSchema'
import { plainNeededWhen } from '@/features/forms/plainCondition'

const FIELDS: FormField[] = [
  {
    key: 'is_owner',
    label: 'Are you the property owner?',
    type: 'select',
    required: false,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'near_water',
    label: 'The work is within 250 feet of a lake, pond or river',
    type: 'checkbox',
    required: false,
  },
  {
    key: 'work_type',
    label: 'Type of work',
    type: 'select',
    required: true,
    options: [
      { value: 'building', label: 'Building' },
      { value: 'demolition', label: 'Demolition' },
    ],
  },
  { key: 'units', label: 'Number of dwelling units', type: 'integer', required: false },
]

describe('plainNeededWhen', () => {
  it('names the answer that makes a document needed, quoting the question', () => {
    expect(plainNeededWhen({ field: 'is_owner', op: 'equals', value: 'no' }, FIELDS)).toBe(
      'Needed only if you answer “No” to “Are you the property owner?”.',
    )
  })

  it('reads a yes or no question as Yes or No', () => {
    expect(plainNeededWhen({ field: 'near_water', op: 'is_true' }, FIELDS)).toBe(
      'Needed only if you answer “Yes” to “The work is within 250 feet of a lake, pond or river”.',
    )
    expect(plainNeededWhen({ field: 'near_water', op: 'is_false' }, FIELDS)).toBe(
      'Needed only if you answer “No” to “The work is within 250 feet of a lake, pond or river”.',
    )
  })

  it('joins several answers with or, and reads numbers as more or less than', () => {
    expect(
      plainNeededWhen(
        {
          any: [
            { field: 'work_type', op: 'equals', value: 'demolition' },
            { field: 'units', op: 'gt', value: 2 },
          ],
        },
        FIELDS,
      ),
    ).toBe(
      'Needed only if you answer “Demolition” to “Type of work”, or your answer to “Number of dwelling units” is more than 2.',
    )
  })
})
