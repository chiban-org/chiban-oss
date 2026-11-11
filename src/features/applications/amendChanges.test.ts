import { describe, expect, it } from 'vitest'
import { amendPhrase, answerChanges } from '@/features/applications/amendChanges'
import type { FormBody } from '@/features/forms/formSchema'

const FORM = {
  fields: [
    { key: 'about', label: 'About the work', type: 'section', required: false },
    {
      key: 'classification',
      label: 'Classification',
      type: 'select',
      required: true,
      options: [
        { value: 'residential', label: 'Residential' },
        { value: 'nonresidential', label: 'Nonresidential' },
      ],
    },
    { key: 'dwelling_units', label: 'Dwelling units', type: 'integer', required: false },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
    { key: 'start_date', label: 'Start date', type: 'date', required: false },
  ],
} as unknown as FormBody

describe('answerChanges', () => {
  it('lists each changed answer with its label and the old and new answer in words', () => {
    expect(
      answerChanges(
        FORM,
        { classification: 'residential', dwelling_units: 1, start_date: '2027-03-01' },
        { classification: 'nonresidential', dwelling_units: 1, description: 'New garage' },
      ),
    ).toEqual([
      { label: 'Classification', from: 'Residential', to: 'Nonresidential' },
      { label: 'Description', from: 'blank', to: 'New garage' },
      { label: 'Start date', from: 'March 1, 2027', to: 'blank' },
    ])
  })

  it('reports nothing when no answer changed', () => {
    const values = { classification: 'residential', dwelling_units: 2 }
    expect(answerChanges(FORM, values, { ...values })).toEqual([])
  })

  it('shortens a long answer', () => {
    const long = 'x'.repeat(200)
    const [change] = answerChanges(FORM, {}, { description: long })
    expect(change?.to.length).toBeLessThanOrEqual(80)
    expect(change?.to.endsWith('...')).toBe(true)
  })
})

describe('amendPhrase', () => {
  it('names what changed', () => {
    expect(
      amendPhrase([
        { label: 'Classification', from: 'Residential', to: 'Nonresidential' },
        { label: 'Dwelling units', from: '1', to: '2' },
      ]),
    ).toBe(
      'Amended the application: Classification from Residential to Nonresidential; Dwelling units from 1 to 2',
    )
  })

  it('says when an amendment changed no answers', () => {
    expect(amendPhrase([])).toBe('Amended the application, no answers changed')
  })

  it('falls back to the plain phrase for older entries without a list of changes', () => {
    expect(amendPhrase(undefined)).toBe('Amended the application')
    expect(amendPhrase([{ label: 1 }])).toBe('Amended the application')
  })
})
