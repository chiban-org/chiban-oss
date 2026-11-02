// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DayList } from '@/components/inspections/DayList'
import type { DayListRow } from '@/features/inspections/dayList'

afterEach(cleanup)

const stop: DayListRow = {
  inspectionId: 'i1',
  startMinute: 570,
  durationMinutes: 60,
  inspectionType: 'rough',
  typeLabel: 'Rough',
  applicationNumber: 'EL-2027-0001',
  siteAddress: { state: 'known', value: '12 Elm Road', asOf: '2027-07-01' },
  parcelDisplayId: '007-001',
  contactName: 'Pat Contact',
  contactPhone: '603-555-0100',
  accessNotes: 'Gate code 4411',
  isReinspection: false,
  previousFailureNotes: null,
  status: 'scheduled',
  rowVersion: 1,
}

describe('DayList', () => {
  it('day list card shows a tel link and a status chip with a text label', () => {
    render(<DayList date="2027-07-07" stops={[stop]} previousHref="/p" nextHref="/n" />)
    const card = screen.getByRole('listitem')
    expect(
      within(card)
        .getByRole('link', { name: /603-555-0100/ })
        .getAttribute('href'),
    ).toBe('tel:6035550100')
    expect(within(card).getByText('Scheduled')).toBeTruthy()
    expect(within(card).getByText('9:30 AM')).toBeTruthy()
    expect(
      within(card)
        .getByRole('link', { name: /12 Elm Road/ })
        .getAttribute('href'),
    ).toBe('https://maps.google.com/?q=12%20Elm%20Road')
  })

  it('shows the date in the long format and the stepper links', () => {
    render(<DayList date="2027-07-07" stops={[]} previousHref="/p" nextHref="/n" />)
    expect(screen.getByRole('heading', { name: 'July 7, 2027' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Previous day' }).getAttribute('href')).toBe('/p')
    expect(screen.getByRole('link', { name: 'Next day' }).getAttribute('href')).toBe('/n')
    expect(screen.getByText('No inspections on this day.')).toBeTruthy()
  })

  it('a reinspection stop shows the previous failure notes', () => {
    render(
      <DayList
        date="2027-07-07"
        stops={[{ ...stop, isReinspection: true, previousFailureNotes: 'Secure the panel box' }]}
        previousHref="/p"
        nextHref="/n"
      />,
    )
    expect(screen.getByText('Reinspection')).toBeTruthy()
    expect(screen.getByText(/Secure the panel box/)).toBeTruthy()
  })

  it('an address that is not known says so and offers no map link', () => {
    render(
      <DayList
        date="2027-07-07"
        stops={[{ ...stop, siteAddress: { state: 'unknown' } }]}
        previousHref="/p"
        nextHref="/n"
      />,
    )
    expect(screen.getByText('Address not on file')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /maps/i })).toBeNull()
  })

  it('each stop opens its inspection page', () => {
    render(<DayList date="2027-07-07" stops={[stop]} previousHref="/p" nextHref="/n" />)
    expect(screen.getByRole('link', { name: /Open EL-2027-0001/ }).getAttribute('href')).toBe(
      '/staff/inspections/i1',
    )
  })
})
