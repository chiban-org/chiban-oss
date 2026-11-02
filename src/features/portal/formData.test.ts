import { describe, expect, it } from 'vitest'
import type { FormBody } from '@/features/forms/formSchema'
import { fieldErrorCopy, rawValuesFromForm } from '@/features/portal/formData'

const FORM: FormBody = {
  key: 'f',
  label: 'F',
  fields: [
    { key: 'scope', label: 'Scope', type: 'text', required: true },
    { key: 'sprinklered', label: 'Sprinklered', type: 'checkbox', required: false },
    {
      key: 'systems',
      label: 'Systems',
      type: 'multiselect',
      required: false,
      options: [
        { value: 'gas', label: 'Gas' },
        { value: 'electric', label: 'Electric' },
      ],
    },
    { key: 'note', label: 'Note', type: 'text', required: false, staffOnly: true },
  ],
}

describe('rawValuesFromForm', () => {
  it('reads text, checkbox, and multiselect values and ignores staff-only fields', () => {
    const data = new FormData()
    data.set('scope', 'Garage')
    data.set('sprinklered', 'true')
    data.append('systems', 'gas')
    data.append('systems', 'electric')
    data.set('note', 'staff wrote this')
    expect(rawValuesFromForm(data, FORM)).toEqual({
      scope: 'Garage',
      sprinklered: true,
      systems: ['gas', 'electric'],
    })
  })

  it('leaves absent fields out', () => {
    expect(rawValuesFromForm(new FormData(), FORM)).toEqual({})
  })
})

describe('fieldErrorCopy', () => {
  it('words every error code', () => {
    expect(fieldErrorCopy('required')).toBe('This is required.')
    expect(fieldErrorCopy('option')).toBe('Choose one of the listed options.')
  })
})
