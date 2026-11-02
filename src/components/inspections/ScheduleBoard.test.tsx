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
})
