// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { emptyInputs, mergeSuggestions } from '@/features/enforcement/sections/suggestions'
import { ProvisionFields } from './ProvisionFields'

afterEach(cleanup)
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const suggestions = mergeSuggestions({
  ...emptyInputs(),
  used: [{ kind: 'zoning_ordinance', ref: 'Zoning Ordinance Section 6.1', count: 3 }],
  town: [
    {
      kind: 'zoning_ordinance',
      reference: 'Zoning Ordinance Section 4.2',
      title: 'accessory structure setbacks',
    },
  ],
  stateCode: [{ reference: 'IRC 2021 Section R105.1', title: 'Required', topic: 'no permit' }],
})

function field() {
  return screen.getByRole('combobox', { name: /Section or condition/ })
}

function chips() {
  return within(screen.getByRole('group', { name: 'Common sections' }))
    .getAllByRole('button')
    .map((b) => b.textContent)
}

describe('the section field', () => {
  it('shows chips for the chosen kind and changes them with the kind', () => {
    render(<ProvisionFields suggestions={suggestions} />)
    expect(chips()).toEqual([
      'Zoning Ordinance Section 6.1Used 3 times',
      'Zoning Ordinance Section 4.2, accessory structure setbacksTown list',
    ])
    fireEvent.change(screen.getByLabelText(/What was violated/), {
      target: { value: 'building_code' },
    })
    expect(chips()).toEqual(['IRC 2021 Section R105.1, no permitState building code'])
  })

  it('fills the field from a chip', () => {
    render(<ProvisionFields suggestions={suggestions} />)
    fireEvent.click(screen.getByRole('button', { name: /Section 4\.2/ }))
    expect(field()).toHaveProperty(
      'value',
      'Zoning Ordinance Section 4.2, accessory structure setbacks',
    )
  })

  it('suggests a section by a title word and picks it with the arrow keys and Enter', () => {
    render(<ProvisionFields suggestions={suggestions} />)
    fireEvent.change(field(), { target: { value: 'setback' } })
    expect(field().getAttribute('aria-expanded')).toBe('true')
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Zoning Ordinance Section 4.2, accessory structure setbacksTown list',
    ])
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(field().getAttribute('aria-activedescendant')).toBe(options[0]?.id)
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(field()).toHaveProperty(
      'value',
      'Zoning Ordinance Section 4.2, accessory structure setbacks',
    )
    expect(field().getAttribute('aria-expanded')).toBe('false')
  })

  it('closes the list with Escape and keeps free text as typed', () => {
    render(<ProvisionFields suggestions={suggestions} />)
    fireEvent.change(field(), { target: { value: 'Section 4' } })
    expect(field().getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(field().getAttribute('aria-expanded')).toBe('false')
    fireEvent.change(field(), { target: { value: 'Sign ordinance Section 2' } })
    expect(field()).toHaveProperty('value', 'Sign ordinance Section 2')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('submits the section under the provisionRef name', () => {
    render(<ProvisionFields suggestions={null} defaultRef="Section 9" />)
    expect(field().getAttribute('name')).toBe('provisionRef')
    expect(screen.queryByRole('group', { name: 'Common sections' })).toBeNull()
  })
})
