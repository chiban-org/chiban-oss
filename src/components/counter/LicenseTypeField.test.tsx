// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { LicenseGroup } from '@/components/counter/counterTypes'
import { LicenseTypeField } from '@/components/counter/LicenseTypeField'

afterEach(cleanup)

const GROUPS: LicenseGroup[] = [
  { label: 'Electrical', licenses: ['Master electrician', 'Journeyman electrician'] },
  { label: 'Plumbing', licenses: ['Master plumber'] },
]

function field(defaultValue: string) {
  render(
    <form data-testid="form">
      <LicenseTypeField groups={GROUPS} defaultValue={defaultValue} />
    </form>,
  )
  return () => new FormData(screen.getByTestId<HTMLFormElement>('form')).getAll('licenseType')
}

describe('LicenseTypeField', () => {
  it('is a dropdown of the license types grouped by trade, defaulted to the given type', () => {
    const posted = field('Master plumber')
    const select = screen.getByLabelText<HTMLSelectElement>('License type')
    expect(select.tagName).toBe('SELECT')
    expect(select.value).toBe('Master plumber')
    expect(screen.getByRole('group', { name: 'Electrical' })).toBeTruthy()
    expect(screen.queryByLabelText('Other license type')).toBeNull()
    expect(posted()).toEqual(['Master plumber'])
  })

  it('asks for a choice when there is no default', () => {
    field('')
    const select = screen.getByLabelText<HTMLSelectElement>('License type')
    expect(select.value).toBe('')
    expect(select.required).toBe(true)
  })

  it('Other reveals a text field whose text is what gets stored', () => {
    const posted = field('Master electrician')
    fireEvent.change(screen.getByLabelText('License type'), { target: { value: '__other__' } })
    const other = screen.getByLabelText<HTMLInputElement>('Other license type')
    expect(other.required).toBe(true)
    fireEvent.change(other, { target: { value: 'Water treatment technician' } })
    expect(posted()).toEqual(['Water treatment technician'])
  })

  it('shows a stored free-text value as it was written, under Other', () => {
    const posted = field('Plumbing permit')
    expect(screen.getByLabelText<HTMLSelectElement>('License type').value).toBe('__other__')
    expect(screen.getByLabelText<HTMLInputElement>('Other license type').value).toBe(
      'Plumbing permit',
    )
    expect(posted()).toEqual(['Plumbing permit'])
  })
})
