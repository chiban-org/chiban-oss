// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CheckedNames,
  DollarsInput,
  NamePicker,
  PercentInput,
  TextRows,
} from '@/components/config/plainFields'

afterEach(cleanup)

const FORMS = [
  { key: 'bp-form', label: 'Building permit application' },
  { key: 'el-form', label: 'Electrical permit application', note: 'not published yet' },
]

describe('money and percent inputs', () => {
  it('shows cents as dollars and stores whole cents', () => {
    const onCents = vi.fn()
    render(<DollarsInput label="Amount" cents={4500} onCents={onCents} />)
    const input = screen.getByLabelText<HTMLInputElement>(/^Amount/)
    expect(input.value).toBe('45')
    fireEvent.change(input, { target: { value: '12.34' } })
    expect(onCents).toHaveBeenLastCalledWith(1234)
  })

  it('keeps fractions of a cent for a rate', () => {
    const onCents = vi.fn()
    render(<DollarsInput label="Rate" cents={35} fractionOfCent onCents={onCents} />)
    const input = screen.getByLabelText<HTMLInputElement>(/^Rate/)
    expect(input.value).toBe('0.35')
    fireEvent.change(input, { target: { value: '0.355' } })
    expect(onCents).toHaveBeenLastCalledWith(35.5)
  })

  it('shows basis points as a percent and stores basis points', () => {
    const onBasisPoints = vi.fn()
    render(<PercentInput label="Percent" basisPoints={300} onBasisPoints={onBasisPoints} />)
    const input = screen.getByLabelText<HTMLInputElement>(/^Percent/)
    expect(input.value).toBe('3')
    fireEvent.change(input, { target: { value: '2.5' } })
    expect(onBasisPoints).toHaveBeenLastCalledWith(250)
  })

  it('refuses an emptied amount instead of keeping the old value silently', () => {
    render(
      <form>
        <DollarsInput label="Amount" cents={4500} onCents={vi.fn()} />
        <PercentInput label="Percent" basisPoints={300} onBasisPoints={vi.fn()} />
      </form>,
    )
    for (const label of [/^Amount/, /^Percent/]) {
      const input = screen.getByLabelText<HTMLInputElement>(label)
      fireEvent.change(input, { target: { value: '' } })
      expect(input.validity.valueMissing).toBe(true)
    }
  })

  it('reports nothing until the person types', () => {
    const onCents = vi.fn()
    render(<DollarsInput label="Amount" cents={4500} onCents={onCents} />)
    expect(onCents).not.toHaveBeenCalled()
  })
})

describe('reference pickers', () => {
  it('lists names and stores the key of the one picked', () => {
    const onChange = vi.fn()
    render(<NamePicker label="Form" value="bp-form" choices={FORMS} onChange={onChange} />)
    const select = screen.getByLabelText<HTMLSelectElement>('Form')
    expect(select.selectedOptions[0]?.textContent).toBe('Building permit application')
    expect(screen.getByText('Electrical permit application (not published yet)')).toBeTruthy()
    fireEvent.change(select, { target: { value: 'el-form' } })
    expect(onChange).toHaveBeenCalledWith('el-form')
  })

  it('asks for a choice instead of showing a key that matches nothing', () => {
    render(<NamePicker label="Form" value="form-key" choices={FORMS} onChange={vi.fn()} />)
    const select = screen.getByLabelText<HTMLSelectElement>('Form')
    expect(select.selectedOptions[0]?.textContent).toBe('Choose one')
    expect(document.body.textContent).not.toContain('form-key')
  })

  it('ticks names on and off and stores their keys', () => {
    const onChange = vi.fn()
    render(
      <CheckedNames
        legend="Forms"
        values={['bp-form']}
        choices={FORMS}
        empty="None"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByLabelText('Electrical permit application (not published yet)'))
    expect(onChange).toHaveBeenLastCalledWith(['bp-form', 'el-form'])
    fireEvent.click(screen.getByLabelText('Building permit application'))
    expect(onChange).toHaveBeenLastCalledWith([])
  })
})

function RowsHarness({ initial }: { initial: string[] }) {
  const [values, setValues] = useState(initial)
  return (
    <>
      <TextRows
        legend="Places"
        rowLabel="Place"
        addLabel="Add a place"
        values={values}
        onChange={setValues}
      />
      <output data-testid="stored">{JSON.stringify(values)}</output>
    </>
  )
}

describe('row lists', () => {
  it('edits, adds and removes rows and stores only filled rows', () => {
    render(<RowsHarness initial={['Town Hall', 'Library']} />)
    const stored = () => JSON.parse(screen.getByTestId('stored').textContent) as string[]
    fireEvent.click(screen.getByRole('button', { name: 'Add a place' }))
    expect(screen.getByLabelText('Place 3')).toBeTruthy()
    expect(stored()).toEqual(['Town Hall', 'Library'])
    fireEvent.change(screen.getByLabelText('Place 3'), { target: { value: 'Post office' } })
    expect(stored()).toEqual(['Town Hall', 'Library', 'Post office'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0] as HTMLElement)
    expect(stored()).toEqual(['Library', 'Post office'])
  })

  it('sits each Remove beside its own input at the input height', () => {
    render(<RowsHarness initial={['Town Hall']} />)
    const input = screen.getByLabelText('Place 1')
    const remove = screen.getByRole('button', { name: 'Remove' })
    const row = input.closest('[data-slot="field-control-row"]')
    expect(row?.contains(remove)).toBe(true)
    expect(input.classList.contains('h-9')).toBe(true)
    expect(remove.classList.contains('h-9')).toBe(true)
  })
})
