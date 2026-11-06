import { describe, expect, it } from 'vitest'
import type { FormBody } from '@/features/forms/formSchema'
import { reviewChanges } from './assessCorrection'

const form = {
  key: 'f',
  label: 'F',
  fields: [
    {
      key: 'after_the_fact',
      type: 'checkbox',
      label: 'Work started before permit',
      required: false,
      fact: 'afterTheFact',
      staffOnly: true,
    },
    {
      key: 'dwelling_units',
      type: 'integer',
      label: 'Number of dwelling units',
      required: false,
      fact: 'dwellingUnits',
    },
    { key: 'description', type: 'textarea', label: 'Description of work', required: true },
  ],
} as unknown as FormBody

describe('reviewChanges', () => {
  it('does not count an unanswered checkbox fact turning into false as a change', () => {
    expect(
      reviewChanges(form, { description: 'a' }, { description: 'a', after_the_fact: false }),
    ).toEqual([])
  })

  it('counts a checkbox fact turning true as a change', () => {
    expect(
      reviewChanges(form, { description: 'a' }, { description: 'a', after_the_fact: true }),
    ).toEqual(['Work started before permit'])
  })

  it('counts a changed number fact as a change', () => {
    expect(reviewChanges(form, { dwelling_units: 1 }, { dwelling_units: 2 })).toEqual([
      'Number of dwelling units',
    ])
  })
})
