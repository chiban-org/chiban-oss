// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormRenderer } from '@/components/forms/FormRenderer'
import type { FormBody } from '@/features/forms/formSchema'

afterEach(cleanup)

const FORM: FormBody = {
  key: 'bp',
  label: 'Building permit',
  fields: [
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
    {
      key: 'dwelling_units',
      label: 'Dwelling units',
      type: 'integer',
      required: false,
      showIf: { field: 'classification', op: 'equals', value: 'residential' },
    },
    { key: 'scope', label: 'Scope of work', type: 'textarea', required: true },
    { key: 'contact_email', label: 'Contact email', type: 'email', required: false },
    { key: 'sprinklered', label: 'Sprinklered', type: 'checkbox', required: false },
    {
      key: 'inspector_note',
      label: 'Inspector note',
      type: 'text',
      required: false,
      staffOnly: true,
    },
  ],
}

const noop = () => undefined

describe('FormRenderer', () => {
  it('form renderer hides dwelling units until residential is chosen', () => {
    const { rerender } = render(
      <FormRenderer form={FORM} values={{}} errors={{}} onChange={noop} />,
    )
    expect(screen.queryByLabelText('Dwelling units')).toBeNull()
    rerender(
      <FormRenderer
        form={FORM}
        values={{ classification: 'residential' }}
        errors={{}}
        onChange={noop}
      />,
    )
    expect(screen.getByLabelText('Dwelling units')).toBeTruthy()
  })

  it('staff-only field is not rendered', () => {
    render(<FormRenderer form={FORM} values={{}} errors={{}} onChange={noop} />)
    expect(screen.queryByLabelText('Inspector note')).toBeNull()
  })

  it('every input is labeled and an error is announced through aria-describedby', () => {
    render(
      <FormRenderer
        form={FORM}
        values={{}}
        errors={{ scope: 'This is required.' }}
        onChange={noop}
      />,
    )
    const scope = screen.getByLabelText('Scope of work')
    expect(scope.getAttribute('aria-invalid')).toBe('true')
    const describedBy = scope.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('This is required.')
  })

  it('reports typed values and marks required fields', () => {
    const onChange = vi.fn()
    render(<FormRenderer form={FORM} values={{}} errors={{}} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Scope of work'), { target: { value: 'Garage' } })
    expect(onChange).toHaveBeenCalledWith('scope', 'Garage')
    expect(screen.getByLabelText('Scope of work').hasAttribute('required')).toBe(true)
    expect(screen.getByLabelText('Contact email').getAttribute('type')).toBe('email')
  })
})
