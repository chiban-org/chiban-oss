// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HonestText } from '@/components/parcels/HonestText'

afterEach(cleanup)

describe('HonestText', () => {
  it('renders a known value as is', () => {
    render(
      <HonestText
        value={{ state: 'known', value: 'Larkspur Family Trust', asOf: '2027-01-01T15:00:00Z' }}
      />,
    )
    expect(screen.getByText('Larkspur Family Trust')).toBeTruthy()
  })

  it('stale renders the age note with the last import date', () => {
    render(
      <HonestText
        value={{ state: 'stale', value: 'x', asOf: '2027-01-01T15:00:00Z', staleAfterDays: 90 }}
        timeZone="America/New_York"
      />,
    )
    expect(
      screen.getByText('Stale: last imported January 1, 2027, older than 90 days'),
    ).toBeTruthy()
    expect(screen.getByText('x')).toBeTruthy()
  })

  it('import_failed renders "Last import failed" with the failure time', () => {
    render(
      <HonestText
        value={{
          state: 'import_failed',
          value: 'Last Known Owner',
          lastSuccessAt: '2027-01-01T15:00:00Z',
          lastFailureAt: '2027-02-01T15:00:00Z',
        }}
        timeZone="America/New_York"
      />,
    )
    expect(screen.getByText(/Last import failed February 1, 2027/)).toBeTruthy()
    expect(screen.getByText('Last Known Owner')).toBeTruthy()
  })

  it('unknown renders "Unknown"', () => {
    render(<HonestText value={{ state: 'unknown' }} />)
    expect(screen.getByText('Unknown')).toBeTruthy()
  })

  it('not_applicable renders "Not applicable"', () => {
    render(<HonestText value={{ state: 'not_applicable' }} />)
    expect(screen.getByText('Not applicable')).toBeTruthy()
  })

  it('uses a custom formatter for values', () => {
    render(
      <HonestText
        value={{ state: 'known', value: 1.4, asOf: '2027-01-01T15:00:00Z' }}
        format={(n) => `${n} acres`}
      />,
    )
    expect(screen.getByText('1.4 acres')).toBeTruthy()
  })
})
