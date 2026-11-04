// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type BoardDay,
  type BoardRequest,
  ScheduleBoard,
} from '@/components/inspections/ScheduleBoard'

afterEach(cleanup)

const requests: BoardRequest[] = [
  {
    inspectionId: 'i1',
    rowVersion: 1,
    applicationNumber: 'EL-2027-0001',
    typeLabel: 'Rough',
    channel: 'phone',
    preferredDate: '2027-07-07',
    isReinspection: false,
    address: '12 Elm Road',
    contactName: 'Pat',
  },
  {
    inspectionId: 'i2',
    rowVersion: 4,
    applicationNumber: 'BP-2027-0002',
    typeLabel: 'Framing',
    channel: 'portal',
    preferredDate: null,
    isReinspection: true,
    address: '9 Birch Lane',
    contactName: 'Sam',
  },
]

const days: BoardDay[] = [
  {
    date: '2027-07-07',
    inspectorUserId: 'u1',
    inspectorName: 'Ines Inspector',
    freeStarts: [570, 630],
    booked: 0,
  },
]

function setup(onSchedule = vi.fn()) {
  render(<ScheduleBoard requests={requests} days={days} onSchedule={onSchedule} message={null} />)
  return onSchedule
}

describe('ScheduleBoard', () => {
  it('board lists a reinspection badge with a text label', () => {
    setup()
    const item = screen.getByRole('option', { name: /BP-2027-0002/ })
    expect(within(item).getByText('Reinspection')).toBeTruthy()
    expect(within(item).getByText('Portal')).toBeTruthy()
  })

  it('shows its keys as shared key hints', () => {
    setup()
    const hints = document.querySelector('[data-slot="key-hints"]') as HTMLElement
    expect(hints.querySelectorAll('kbd').length).toBe(4)
    expect(hints.textContent).toContain('choose a request')
  })

  it('shows free slots by inspector and date in the long format', () => {
    setup()
    expect(screen.getByText('July 7, 2027')).toBeTruthy()
    expect(screen.getByText('Ines Inspector')).toBeTruthy()
    expect(screen.getByRole('button', { name: /9:30 AM/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /10:30 AM/ })).toBeTruthy()
  })

  it('each slot button names its day and inspector, not only the time', () => {
    setup()
    expect(
      screen.getByRole('button', { name: '9:30 AM, July 7, 2027, Ines Inspector' }),
    ).toBeTruthy()
  })

  it('pressing s schedules the selected request into the focused slot', () => {
    const onSchedule = setup()
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.focus(screen.getByRole('button', { name: /10:30 AM/ }))
    fireEvent.keyDown(document, { key: 's' })
    expect(onSchedule).toHaveBeenCalledWith({
      inspectionId: 'i1',
      rowVersion: 1,
      date: '2027-07-07',
      startMinute: 630,
      inspectorUserId: 'u1',
    })
  })

  it('j and k move the selection', () => {
    const onSchedule = setup()
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 'k' })
    fireEvent.focus(screen.getByRole('button', { name: /9:30 AM/ }))
    fireEvent.keyDown(document, { key: 's' })
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ inspectionId: 'i1' }))
  })

  it('s does nothing without a selected request or a focused slot', () => {
    const onSchedule = setup()
    fireEvent.keyDown(document, { key: 's' })
    fireEvent.keyDown(document, { key: 'j' })
    fireEvent.keyDown(document, { key: 's' })
    expect(onSchedule).not.toHaveBeenCalled()
  })

  it('/ focuses the search and typing there does not trigger shortcuts', () => {
    const onSchedule = setup()
    fireEvent.keyDown(document, { key: '/' })
    const search = screen.getByRole('searchbox', { name: 'Search requests' })
    expect(document.activeElement).toBe(search)
    fireEvent.keyDown(search, { key: 's' })
    expect(onSchedule).not.toHaveBeenCalled()
  })

  it('search narrows the unscheduled list', () => {
    setup()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search requests' }), {
      target: { value: 'birch' },
    })
    expect(screen.queryByRole('option', { name: /EL-2027-0001/ })).toBeNull()
    expect(screen.getByRole('option', { name: /BP-2027-0002/ })).toBeTruthy()
  })

  it('says so when nothing is waiting', () => {
    render(<ScheduleBoard requests={[]} days={days} onSchedule={vi.fn()} message={null} />)
    expect(screen.getByText('No requests are waiting.')).toBeTruthy()
  })

  it('links each request card to its inspection', () => {
    setup()
    const item = screen.getByRole('option', { name: /EL-2027-0001/ })
    expect(
      within(item).getByRole('link', { name: 'EL-2027-0001, Rough' }).getAttribute('href'),
    ).toBe('/staff/inspections/i1')
  })

  it('labels the search where it can be seen and says what it searches', () => {
    setup()
    expect(screen.getByText('Search requests', { selector: 'label' })).toBeTruthy()
    expect(
      screen.getByRole('searchbox', { name: 'Search requests' }).getAttribute('placeholder'),
    ).toBe('Permit number, address or contact')
  })

  it('keeps the first slot days open and folds the rest to one line each', () => {
    const many: BoardDay[] = ['2027-07-07', '2027-07-08', '2027-07-09', '2027-07-12'].map(
      (date) => ({
        date,
        inspectorUserId: 'u1',
        inspectorName: 'Ines Inspector',
        freeStarts: [570],
        booked: 0,
      }),
    )
    const { container } = render(
      <ScheduleBoard requests={requests} days={many} onSchedule={vi.fn()} message={null} />,
    )
    const folded = container.querySelectorAll('details')
    expect(folded).toHaveLength(1)
    expect(folded[0]?.querySelector('summary')?.textContent).toBe(
      'July 12, 2027, Ines Inspector, 1 open',
    )
  })
})
