// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
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
    preferredDate: '2027-07-14',
    isReinspection: true,
    address: '9 Birch Lane',
    contactName: 'Sam',
  },
]

function slotDay(date: string, freeStarts: number[]): BoardDay {
  return { date, inspectorUserId: 'u1', inspectorName: 'Ines Inspector', freeStarts, booked: 0 }
}

const days: BoardDay[] = [
  slotDay('2027-07-07', [570, 630]),
  slotDay('2027-07-09', []),
  slotDay('2027-07-14', [810]),
]

function board(overrides: { requests?: BoardRequest[]; days?: BoardDay[] } = {}) {
  return render(
    <ScheduleBoard
      requests={overrides.requests ?? requests}
      days={overrides.days ?? days}
      today="2027-07-06"
      takeRequest={null}
      onSchedule={vi.fn()}
      message={null}
    />,
  )
}

function setup(onSchedule = vi.fn(), takeRequest: ReactNode = null) {
  render(
    <ScheduleBoard
      requests={requests}
      days={days}
      today="2027-07-06"
      takeRequest={takeRequest}
      onSchedule={onSchedule}
      message={null}
    />,
  )
  return onSchedule
}

const weeks = () => screen.getByRole('group', { name: 'Weeks' })

describe('ScheduleBoard requests', () => {
  it('board lists a reinspection badge with a text label', () => {
    setup()
    const item = screen.getByRole('option', { name: /BP-2027-0002/ })
    expect(within(item).getByText('Reinspection')).toBeTruthy()
    expect(within(item).getByText('Portal')).toBeTruthy()
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

  it('search narrows the unscheduled list', () => {
    setup()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search requests' }), {
      target: { value: 'birch' },
    })
    expect(screen.queryByRole('option', { name: /EL-2027-0001/ })).toBeNull()
    expect(screen.getByRole('option', { name: /BP-2027-0002/ })).toBeTruthy()
  })

  it('says so when nothing is waiting', () => {
    board({ requests: [] })
    expect(screen.getByText('No requests are waiting.')).toBeTruthy()
  })

  it('marks the chosen request in words and names it above the slots', () => {
    setup()
    expect(screen.getByText('Choose a request, then an open time.')).toBeTruthy()
    const item = screen.getByRole('option', { name: /EL-2027-0001/ })
    fireEvent.click(item)
    expect(item.getAttribute('aria-selected')).toBe('true')
    expect(within(item).getByText('Chosen')).toBeTruthy()
    expect(screen.getByText('Pick a time for EL-2027-0001, Rough.')).toBeTruthy()
  })

  it('puts Take a request at the top of the request column', () => {
    setup(vi.fn(), <section aria-label="Take a request">lookup</section>)
    const column = screen.getByTestId('request-column')
    const take = within(column).getByRole('region', { name: 'Take a request' })
    const queue = within(column).getByRole('region', { name: 'Requests and bookings' })
    expect(column.firstElementChild).toBe(take)
    expect(take.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('ScheduleBoard open slots', () => {
  it('shows each inspection day as a row with its weekday, date, inspector and times', () => {
    setup()
    const row = screen.getByRole('listitem', { name: 'Wednesday, July 7, 2027, Ines Inspector' })
    expect(within(row).getByText('2 open')).toBeTruthy()
    expect(
      within(row).getByRole('button', { name: '9:30 AM, July 7, 2027, Ines Inspector' }),
    ).toBeTruthy()
    expect(within(row).getByRole('button', { name: /10:30 AM/ })).toBeTruthy()
  })

  it('shows a day with no open slots muted and without times', () => {
    setup()
    const row = screen.getByRole('listitem', { name: 'Friday, July 9, 2027, Ines Inspector' })
    expect(row.getAttribute('data-full')).toBe('true')
    expect(row.className).toContain('text-muted-foreground')
    expect(within(row).getByText('No open times')).toBeTruthy()
    expect(within(row).queryByRole('button')).toBeNull()
  })

  it('shows one week at a time and switches weeks from the week buttons', () => {
    setup()
    const thisWeek = within(weeks()).getByRole('button', { name: /This week/ })
    const nextWeek = within(weeks()).getByRole('button', { name: /Next week/ })
    expect(thisWeek.getAttribute('aria-pressed')).toBe('true')
    expect(within(thisWeek).getByText('2 open')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /July 14, 2027/ })).toBeNull()
    fireEvent.click(nextWeek)
    expect(nextWeek.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByRole('button', { name: '1:30 PM, July 14, 2027, Ines Inspector' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /July 7, 2027/ })).toBeNull()
  })

  it('names weeks after next by their Monday', () => {
    board({ days: [...days, slotDay('2027-07-21', [570])] })
    expect(within(weeks()).getByRole('button', { name: /Week of July 19, 2027/ })).toBeTruthy()
  })

  it('opens on the week of the chosen request’s preferred day', () => {
    setup()
    fireEvent.click(screen.getByRole('option', { name: /BP-2027-0002/ }))
    expect(
      within(weeks())
        .getByRole('button', { name: /Next week/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('says so when there are no inspection days', () => {
    board({ days: [] })
    expect(screen.getByText('No inspection days in this range.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Weeks' })).toBeNull()
  })
})

describe('ScheduleBoard scheduling', () => {
  it('clicking a request then a slot schedules it there', () => {
    const onSchedule = setup()
    fireEvent.click(screen.getByRole('option', { name: /EL-2027-0001/ }))
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    expect(onSchedule).toHaveBeenCalledWith({
      inspectionId: 'i1',
      rowVersion: 1,
      date: '2027-07-07',
      startMinute: 630,
      inspectorUserId: 'u1',
    })
  })

  it('schedules into a later week after switching to it', () => {
    const onSchedule = setup()
    fireEvent.click(screen.getByRole('option', { name: /EL-2027-0001/ }))
    fireEvent.click(within(weeks()).getByRole('button', { name: /Next week/ }))
    fireEvent.click(screen.getByRole('button', { name: /1:30 PM/ }))
    expect(onSchedule).toHaveBeenCalledWith({
      inspectionId: 'i1',
      rowVersion: 1,
      date: '2027-07-14',
      startMinute: 810,
      inspectorUserId: 'u1',
    })
  })

  it('keeps the chosen request when a search hides others', () => {
    const onSchedule = setup()
    fireEvent.click(screen.getByRole('option', { name: /BP-2027-0002/ }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search requests' }), {
      target: { value: 'birch' },
    })
    fireEvent.click(screen.getByRole('button', { name: /1:30 PM/ }))
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ inspectionId: 'i2' }))
  })

  it('clicking a slot without a chosen request schedules nothing', () => {
    const onSchedule = setup()
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    expect(onSchedule).not.toHaveBeenCalled()
  })

  it('ignores j, s and / pressed on the page', () => {
    const onSchedule = setup()
    for (const k of ['j', 's', '/']) fireEvent.keyDown(document, { key: k })
    expect(onSchedule).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })
})
