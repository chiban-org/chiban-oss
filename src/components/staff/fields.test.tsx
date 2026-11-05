// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AreaField, CheckField, SelectField, TextField } from '@/components/staff/fields'
import { RequiredNote } from '@/components/ui/required-mark'

afterEach(cleanup)

function submitted(): [string, FormDataEntryValue][] {
  const form = document.querySelector('form')
  if (form === null) throw new Error('no form')
  return Array.from(new FormData(form).entries())
}

describe('staff fields', () => {
  it('labels each control and describes it with its hint', () => {
    render(
      <form>
        <TextField label="Title" name="title" hint="Shown on the agenda" />
        <AreaField label="Details" name="description" />
      </form>,
    )
    const title = screen.getByLabelText<HTMLInputElement>('Title')
    expect(title.name).toBe('title')
    const hintId = title.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(hintId)?.textContent).toBe('Shown on the agenda')
    expect(screen.getByLabelText<HTMLTextAreaElement>('Details').name).toBe('description')
  })

  it('submits the chosen option, including an empty one, under the select name', () => {
    render(
      <form>
        <SelectField
          label="Appeal"
          name="appealId"
          defaultValue=""
          options={[
            ['', 'Not applicable'],
            ['a1', 'First appeal'],
          ]}
        />
      </form>,
    )
    expect(submitted()).toEqual([['appealId', '']])
    fireEvent.change(screen.getByLabelText('Appeal'), { target: { value: 'a1' } })
    expect(submitted()).toEqual([['appealId', 'a1']])
  })

  it('keeps a required select required so the form refuses an empty choice', () => {
    render(
      <form>
        <SelectField
          label="Determination"
          name="determination"
          required
          defaultValue=""
          options={[
            ['', 'Choose a determination'],
            ['yes', 'Regional impact'],
          ]}
        />
      </form>,
    )
    const select = screen.getByLabelText<HTMLSelectElement>(/^Determination/)
    expect(select.validity.valueMissing).toBe(true)
  })

  it('submits a checkbox value only while it is checked', () => {
    render(
      <form>
        <CheckField label="Finding one" name="findingIds" value="f1" />
        <CheckField label="Finding two" name="findingIds" value="f2" defaultChecked />
      </form>,
    )
    expect(submitted()).toEqual([['findingIds', 'f2']])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Finding one' }))
    expect(submitted()).toEqual([
      ['findingIds', 'f1'],
      ['findingIds', 'f2'],
    ])
    fireEvent.click(screen.getByText('Finding two'))
    expect(submitted()).toEqual([['findingIds', 'f1']])
  })

  it('keeps a field at the top of a grid cell taller than itself', () => {
    render(<TextField label="Board name" name="label" />)
    const field = screen.getByLabelText('Board name').closest('[data-slot="field"]')
    expect(field?.classList.contains('content-start')).toBe(true)
  })

  it('puts a field action in one row with its control, between label and hint', () => {
    render(
      <TextField
        label="Place 1"
        hint="Where the notice goes up"
        action={<button type="button">Remove</button>}
      />,
    )
    const row = screen.getByLabelText('Place 1').closest('[data-slot="field-control-row"]')
    expect(row?.contains(screen.getByRole('button', { name: 'Remove' }))).toBe(true)
    expect(row?.nextElementSibling?.textContent).toBe('Where the notice goes up')
  })

  it('centres a checkbox on the first line of its label', () => {
    render(<CheckField label="Notice by posting" />)
    const line = screen.getByRole('checkbox').parentElement
    expect(line?.dataset['slot']).toBe('check-line')
    expect(line?.classList.contains('h-[1lh]')).toBe(true)
    expect(line?.parentElement?.classList.contains('items-start')).toBe(true)
  })

  it('marks a required control with an aria-hidden asterisk and keeps the native attribute', () => {
    render(
      <form>
        <TextField label="Title" name="title" required />
        <TextField label="Nickname" name="nickname" />
        <AreaField label="Details" name="details" required />
        <SelectField label="Kind" name="kind" required options={[['a', 'A']]} />
        <CheckField label="Agree" name="agree" required />
      </form>,
    )
    const marks = document.querySelectorAll('label [aria-hidden="true"]')
    expect(Array.from(marks).map((m) => m.textContent.trim())).toEqual(['*', '*', '*', '*'])
    for (const mark of marks) expect(mark.closest('label')?.getAttribute('for')).not.toBeNull()
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Title' }).required).toBe(true)
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Nickname' }).required).toBe(false)
    const nickname = screen.getByRole('textbox', { name: 'Nickname' })
    expect(document.querySelector(`label[for="${nickname.id}"] [aria-hidden]`)).toBeNull()
  })

  it('shows the Required note only when the form has a required control', async () => {
    const { rerender } = render(
      <form>
        <RequiredNote />
        <TextField label="Nickname" name="nickname" />
      </form>,
    )
    expect(document.querySelector('[data-slot="required-note"]')?.hasAttribute('hidden')).toBe(true)
    rerender(
      <form>
        <RequiredNote />
        <TextField label="Title" name="title" required />
      </form>,
    )
    await waitFor(() =>
      expect(document.querySelector('[data-slot="required-note"]')?.hasAttribute('hidden')).toBe(
        false,
      ),
    )
  })
})
