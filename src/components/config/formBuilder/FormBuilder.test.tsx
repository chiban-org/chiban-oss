// @vitest-environment jsdom
import { NH_STARTERS } from '@packs/nh/starters'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormBuilder } from '@/components/config/formBuilder/FormBuilder'
import type { FormBuilderData } from '@/features/forms/formReferences'
import type { FormBody } from '@/features/forms/formSchema'

afterEach(cleanup)

function Harness({
  initial,
  data = { frozenKeys: [], externalUses: [] },
}: {
  initial: FormBody
  data?: FormBuilderData
}) {
  const [body, setBody] = useState(initial)
  return (
    <>
      <FormBuilder body={body} onChange={setBody} errors={{}} data={data} />
      <output data-testid="state">{JSON.stringify(body)}</output>
    </>
  )
}

function stateBody(): FormBody {
  return JSON.parse(screen.getByTestId('state').textContent) as FormBody
}

const BASE: FormBody = {
  key: 'f',
  label: 'Shed permit',
  fields: [
    {
      key: 'use',
      label: 'Use',
      type: 'select',
      required: true,
      options: [
        { value: 'residential', label: 'Residential' },
        { value: 'commercial', label: 'Commercial' },
      ],
    },
    { key: 'description', label: 'Describe the shed', type: 'textarea', required: true },
  ],
}

function canvas() {
  return screen.getByRole('list', { name: 'Questions' })
}

function settings() {
  return screen.getByRole('region', { name: 'Question settings' })
}

describe('FormBuilder', () => {
  it.each(
    NH_STARTERS.map((s) => [s.id, s.form] as const),
  )('opens the %s starter form without changing it', (_id, form) => {
    const onChange = vi.fn()
    render(
      <FormBuilder
        body={form}
        onChange={onChange}
        errors={{}}
        data={{ frozenKeys: [], externalUses: [] }}
      />,
    )
    for (const field of form.fields) {
      expect(within(canvas()).getByRole('button', { name: `Edit ${field.label}` })).toBeTruthy()
    }
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds a question of the chosen type after the selected one and selects it', () => {
    render(<Harness initial={BASE} />)
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Use' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Whole number' }))
    expect(stateBody().fields.map((f) => f.type)).toEqual(['select', 'integer', 'textarea'])
    const text = within(settings()).getByLabelText<HTMLInputElement>('Question text')
    expect(text.value).toBe('Untitled question')
    fireEvent.change(text, { target: { value: 'Number of bays' } })
    expect(within(settings()).getByLabelText('Question text')).toBe(text)
    expect(stateBody().fields[1]).toMatchObject({ key: 'number_of_bays', label: 'Number of bays' })
  })

  it('adds a section with a title and description', () => {
    render(<Harness initial={BASE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Section' }))
    fireEvent.change(within(settings()).getByLabelText('Section title'), {
      target: { value: 'About the shed' },
    })
    fireEvent.change(within(settings()).getByLabelText('Description'), {
      target: { value: 'Size and placement' },
    })
    expect(stateBody().fields[2]).toEqual({
      key: 'about_the_shed',
      label: 'About the shed',
      help: 'Size and placement',
      type: 'section',
      required: false,
    })
    expect(within(settings()).queryByLabelText('Required')).toBeNull()
  })

  it('edits dropdown choices as a list', () => {
    render(<Harness initial={BASE} />)
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Use' }))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Add choice' }))
    fireEvent.change(within(settings()).getByLabelText('Choice 3'), {
      target: { value: 'Agricultural' },
    })
    fireEvent.click(within(settings()).getByRole('button', { name: 'Move choice 3 up' }))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Remove choice 1' }))
    expect(stateBody().fields[0]?.options).toEqual([
      { value: 'agricultural', label: 'Agricultural' },
      { value: 'commercial', label: 'Commercial' },
    ])
  })

  it('builds a show-only-when rule from three dropdowns', () => {
    render(<Harness initial={BASE} />)
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Describe the shed' }))
    const show = within(settings()).getByRole('group', { name: 'Show only when' })
    fireEvent.click(within(show).getByRole('button', { name: 'Add a rule' }))
    expect(stateBody().fields[1]?.showIf).toEqual({
      field: 'use',
      op: 'equals',
      value: 'residential',
    })
    fireEvent.change(within(show).getByLabelText('Answer'), { target: { value: 'commercial' } })
    fireEvent.change(within(show).getByLabelText('Test'), { target: { value: 'not_equals' } })
    expect(stateBody().fields[1]?.showIf).toEqual({
      field: 'use',
      op: 'not_equals',
      value: 'commercial',
    })
    fireEvent.click(within(show).getByRole('button', { name: 'Add another rule' }))
    fireEvent.change(within(show).getByLabelText('Match'), { target: { value: 'any' } })
    expect(stateBody().fields[1]?.showIf).toEqual({
      any: [
        { field: 'use', op: 'not_equals', value: 'commercial' },
        { field: 'use', op: 'equals', value: 'residential' },
      ],
    })
    expect(
      within(canvas()).getByText(/Shown only when Use is not Commercial, or Use is Residential/),
    ).toBeTruthy()
  })

  it('moves the selected question with the keyboard buttons and keeps it selected', () => {
    render(<Harness initial={BASE} />)
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Describe the shed' }))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Move up' }))
    expect(stateBody().fields.map((f) => f.key)).toEqual(['description', 'use'])
    expect(within(settings()).getByLabelText<HTMLInputElement>('Question text').value).toBe(
      'Describe the shed',
    )
    expect(within(settings()).getByRole('button', { name: 'Move up' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('flags a question whose rule now points at a later question', () => {
    const ruled: FormBody = {
      ...BASE,
      fields: [
        BASE.fields[0] as FormBody['fields'][number],
        {
          ...(BASE.fields[1] as FormBody['fields'][number]),
          showIf: { field: 'use', op: 'equals', value: 'commercial' },
        },
      ],
    }
    render(<Harness initial={ruled} />)
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Describe the shed' }))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Move up' }))
    expect(within(canvas()).getByText(/uses a question that comes after it/)).toBeTruthy()
  })

  it('warns and names each reference before removing a question others use', () => {
    const ruled: FormBody = {
      ...BASE,
      fields: [
        BASE.fields[0] as FormBody['fields'][number],
        {
          ...(BASE.fields[1] as FormBody['fields'][number]),
          showIf: { field: 'use', op: 'equals', value: 'commercial' },
        },
      ],
    }
    render(
      <Harness
        initial={ruled}
        data={{
          frozenKeys: ['use'],
          externalUses: [
            { fieldKey: 'use', source: 'Fee schedule shed-fees (Shed)', detail: 'Shed fee' },
          ],
        }}
      />,
    )
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Use' }))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Remove question' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Question “Describe the shed”')).toBeTruthy()
    expect(within(dialog).getByText('Fee schedule shed-fees (Shed)')).toBeTruthy()
    expect(stateBody().fields).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove anyway' }))
    expect(stateBody().fields.map((f) => f.key)).toEqual(['description'])
    expect(stateBody().fields[0]?.showIf).toBeUndefined()
  })

  it('removes a question nothing uses without asking', () => {
    render(<Harness initial={BASE} />)
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Describe the shed' }))
    fireEvent.click(within(settings()).getByRole('button', { name: 'Remove question' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(stateBody().fields.map((f) => f.key)).toEqual(['use'])
  })

  it('keeps a published key fixed and explains why', () => {
    render(<Harness initial={BASE} data={{ frozenKeys: ['use'], externalUses: [] }} />)
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Use' }))
    const key = within(settings()).getByLabelText<HTMLInputElement>('Key')
    expect(key.disabled).toBe(true)
    expect(within(settings()).getByText(/A published version uses this key/)).toBeTruthy()
    fireEvent.change(within(settings()).getByLabelText('Question text'), {
      target: { value: 'Main use' },
    })
    expect(stateBody().fields[0]).toMatchObject({ key: 'use', label: 'Main use' })
  })

  it('previews the form as an applicant and shows the validation messages', () => {
    render(<Harness initial={BASE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview as applicant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(screen.getAllByText('This is required.')).toHaveLength(2)
    fireEvent.change(screen.getByLabelText('Describe the shed'), { target: { value: '10 by 12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }))
    expect(screen.getByRole('button', { name: 'Phone' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(screen.getAllByText('This is required.')).toHaveLength(1)
  })

  it('changes the answer type, required, staff only and number limits', () => {
    render(<Harness initial={BASE} />)
    fireEvent.click(within(canvas()).getByRole('button', { name: 'Edit Describe the shed' }))
    fireEvent.change(within(settings()).getByLabelText('Answer type'), {
      target: { value: 'integer' },
    })
    fireEvent.click(within(settings()).getByLabelText('Required'))
    fireEvent.change(within(settings()).getByLabelText('Largest allowed'), {
      target: { value: '400' },
    })
    fireEvent.click(within(settings()).getByLabelText('Staff only'))
    expect(stateBody().fields[1]).toMatchObject({
      type: 'integer',
      required: false,
      validation: { max: 400 },
      staffOnly: true,
    })
  })

  it('shows publish errors about the questions above the form', () => {
    render(
      <FormBuilder
        body={BASE}
        onChange={vi.fn()}
        errors={{ fields: 'options required' }}
        data={{ frozenKeys: [], externalUses: [] }}
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe('options required')
  })
})
