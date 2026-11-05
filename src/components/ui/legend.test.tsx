// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Label } from './label'
import { Legend } from './legend'

afterEach(cleanup)

describe('Legend', () => {
  it('names its fieldset group', () => {
    render(
      <fieldset>
        <Legend>Mailing address</Legend>
        <input aria-label="Address line 1" />
      </fieldset>,
    )
    expect(screen.getByRole('group', { name: 'Mailing address' })).toBeTruthy()
  })

  it('outranks a field label: larger and heavier than Label', () => {
    render(
      <fieldset>
        <Legend>Mailing address</Legend>
        <Label htmlFor="line">Address line 1</Label>
        <input id="line" />
      </fieldset>,
    )
    const legend = screen.getByText('Mailing address').className
    const label = screen.getByText('Address line 1').className
    expect(legend).toContain('text-base')
    expect(legend).toContain('font-semibold')
    expect(label).toContain('text-sm')
    expect(label).toContain('font-medium')
  })

  it('sits on the border of a bordered group and above the fields of a plain one', () => {
    const { rerender } = render(<Legend bordered>Route</Legend>)
    expect(screen.getByText('Route').className).toContain('px-1')
    rerender(<Legend>Route</Legend>)
    expect(screen.getByText('Route').className).toContain('mb-3')
  })
})
