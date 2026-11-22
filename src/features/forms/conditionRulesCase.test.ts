import { describe, expect, it } from 'vitest'
import { describeCondition } from '@/features/forms/conditionRules'
import type { FormField } from '@/features/forms/formSchema'

const FIELDS: FormField[] = [
  { key: 'sewer', label: 'Public sewer', type: 'checkbox', required: false },
  { key: 'bedrooms', label: 'The work adds bedrooms', type: 'checkbox', required: false },
  {
    key: 'use',
    label: 'Kind of use',
    type: 'select',
    required: false,
    options: [
      { value: 'residential', label: 'Residential' },
      { value: 'commercial', label: 'Commercial' },
    ],
  },
]

describe('rule sentence case', () => {
  it('keeps the first label capitalised and lower-cases the labels that follow', () => {
    expect(
      describeCondition(
        {
          all: [
            { field: 'sewer', op: 'is_false' },
            { field: 'bedrooms', op: 'is_true' },
          ],
        },
        FIELDS,
      ),
    ).toBe('Public sewer is no, and the work adds bedrooms is yes')
  })

  it('lower-cases the option labels in the middle of a sentence', () => {
    expect(describeCondition({ field: 'use', op: 'equals', value: 'residential' }, FIELDS)).toBe(
      'Kind of use is residential',
    )
    expect(
      describeCondition(
        {
          any: [
            { field: 'sewer', op: 'is_true' },
            { field: 'use', op: 'in', value: ['residential', 'commercial'] },
          ],
        },
        FIELDS,
      ),
    ).toBe('Public sewer is yes, or kind of use is any of residential, commercial')
  })
})
