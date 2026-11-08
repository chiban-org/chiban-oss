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

  it('renders staff-only fields when staff fill the form', () => {
    render(<FormRenderer form={FORM} values={{}} errors={{}} onChange={noop} includeStaffOnly />)
    expect(screen.getByLabelText('Inspector note')).toBeTruthy()
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
    const scope = screen.getByLabelText(/^Scope of work/)
    expect(scope.getAttribute('aria-invalid')).toBe('true')
    const describedBy = scope.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('This is required.')
  })

  it('reports typed values and marks required fields', () => {
    const onChange = vi.fn()
    render(<FormRenderer form={FORM} values={{}} errors={{}} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/^Scope of work/), { target: { value: 'Garage' } })
    expect(onChange).toHaveBeenCalledWith('scope', 'Garage')
    expect(screen.getByLabelText(/^Scope of work/).hasAttribute('required')).toBe(true)
    expect(screen.getByLabelText('Contact email').getAttribute('type')).toBe('email')
  })

  it('renders a section as a heading with its description and no input', () => {
    const sectioned: FormBody = {
      ...FORM,
      fields: [
        {
          key: 'about',
          label: 'About the project',
          help: 'Tell us what you plan to build.',
          type: 'section',
          required: false,
        },
        ...FORM.fields,
      ],
    }
    render(<FormRenderer form={sectioned} values={{}} errors={{}} onChange={noop} />)
    expect(screen.getByRole('heading', { name: 'About the project' })).toBeTruthy()
    expect(screen.getByText('Tell us what you plan to build.')).toBeTruthy()
    expect(screen.queryByLabelText('About the project')).toBeNull()
  })

  it('marks a field required by its condition only while the condition holds', () => {
    const conditional: FormBody = {
      key: 'c',
      label: 'C',
      fields: [
        { key: 'kind', label: 'Kind', type: 'text', required: false },
        {
          key: 'detail',
          label: 'Detail',
          type: 'text',
          required: false,
          requireIf: { field: 'kind', op: 'equals', value: 'other' },
        },
        { key: 'plain', label: 'Plain', type: 'text', required: false },
      ],
    }
    const marked = () => document.querySelector('label[for="field-detail"] [aria-hidden="true"]')
    const { rerender } = render(
      <FormRenderer form={conditional} values={{}} errors={{}} onChange={noop} />,
    )
    expect(marked()).toBeNull()
    expect(document.querySelector('label[for="field-plain"] [aria-hidden]')).toBeNull()
    rerender(
      <FormRenderer form={conditional} values={{ kind: 'other' }} errors={{}} onChange={noop} />,
    )
    expect(marked()?.textContent.trim()).toBe('*')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Detail' }).required).toBe(true)
  })

  it('marks always-required fields', () => {
    render(<FormRenderer form={FORM} values={{}} errors={{}} onChange={noop} />)
    expect(document.querySelector('label[for="field-scope"] [aria-hidden="true"]')).not.toBeNull()
    expect(document.querySelector('label[for="field-contact_email"] [aria-hidden]')).toBeNull()
  })
})
