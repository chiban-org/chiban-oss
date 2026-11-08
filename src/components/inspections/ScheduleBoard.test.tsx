// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type BoardDay,
  type BoardRequest,
  ScheduleBoard,
  type ScheduleChoice,
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

const choose = (pattern: RegExp) => screen.getByRole('button', { name: pattern })

function board(overrides: { requests?: BoardRequest[]; days?: BoardDay[] } = {}) {
  return render(
    <ScheduleBoard
      requests={overrides.requests ?? requests}
      days={overrides.days ?? days}
      today="2027-07-06"
      takeRequest={null}
      onSchedule={vi.fn(() => Promise.resolve(true))}
      message={null}
    />,
  )
}

function setup(
  onSchedule: (choice: ScheduleChoice) => Promise<boolean> = vi.fn(() => Promise.resolve(true)),
  takeRequest: ReactNode = null,
  extra: { initialChosenId?: string } = {},
) {
  render(
    <ScheduleBoard
      requests={requests}
      days={days}
      today="2027-07-06"
      takeRequest={takeRequest}
      onSchedule={onSchedule}
      message={null}
      {...extra}
    />,
  )
  return onSchedule
}

const weeks = () => screen.getByRole('group', { name: 'Weeks' })

describe('ScheduleBoard requests', () => {
  it('board lists a reinspection badge with a text label', () => {
    setup()
    const item = choose(/Choose BP-2027-0002/)
    expect(within(item).getByText('Reinspection')).toBeTruthy()
    expect(within(item).getByText('Portal')).toBeTruthy()
  })

  it('links each request card to its inspection', () => {
    setup()
    expect(screen.getByRole('link', { name: 'EL-2027-0001, Rough' }).getAttribute('href')).toBe(
      '/staff/inspections/i1',
    )
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
    expect(screen.queryByRole('button', { name: /Choose EL-2027-0001/ })).toBeNull()
    expect(choose(/Choose BP-2027-0002/)).toBeTruthy()
  })

  it('says so when nothing is waiting', () => {
    board({ requests: [] })
    expect(screen.getByText('No requests are waiting.')).toBeTruthy()
  })

  it('marks the chosen request in words and names it above the slots', () => {
    setup()
    expect(screen.getByText('Choose a request, then an open time.')).toBeTruthy()
    const item = choose(/Choose EL-2027-0001/)
    fireEvent.click(item)
    expect(item.getAttribute('aria-pressed')).toBe('true')
    expect(within(item.closest('li') as HTMLElement).getByText('Chosen')).toBeTruthy()
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
    expect(screen.queryByRole('button', { name: /July 14, 2027, Ines Inspector/ })).toBeNull()
    fireEvent.click(nextWeek)
    expect(nextWeek.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByRole('button', { name: '1:30 PM, July 14, 2027, Ines Inspector' }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /July 7, 2027, Ines Inspector/ })).toBeNull()
  })

  it('names weeks after next by their Monday', () => {
    board({ days: [...days, slotDay('2027-07-21', [570])] })
    expect(within(weeks()).getByRole('button', { name: /Week of July 19, 2027/ })).toBeTruthy()
  })

  it('opens on the week of the chosen request’s preferred day', () => {
    setup()
    fireEvent.click(choose(/Choose BP-2027-0002/))
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

const book = () => fireEvent.click(screen.getByRole('button', { name: 'Book' }))

describe('ScheduleBoard scheduling', () => {
  it('keeps every time disabled until a request is chosen', () => {
    setup()
    const time = screen.getByRole('button', { name: /10:30 AM/ })
    expect(time.hasAttribute('disabled')).toBe(true)
    fireEvent.click(choose(/Choose EL-2027-0001/))
    expect(time.hasAttribute('disabled')).toBe(false)
  })

  it('opens a review row when a time is tapped and books nothing yet', () => {
    const onSchedule = setup()
    fireEvent.click(choose(/Choose EL-2027-0001/))
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    expect(onSchedule).not.toHaveBeenCalled()
    const review = screen.getByRole('group', { name: 'Review the booking' })
    expect(
      within(review).getByText('Book Wednesday, July 7, 2027 at 10:30 AM with Ines Inspector.'),
    ).toBeTruthy()
    expect(within(review).getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('books the reviewed time with Book', () => {
    const onSchedule = setup()
    fireEvent.click(choose(/Choose EL-2027-0001/))
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    book()
    expect(onSchedule).toHaveBeenCalledWith({
      inspectionId: 'i1',
      rowVersion: 1,
      date: '2027-07-07',
      startMinute: 630,
      inspectorUserId: 'u1',
    })
  })

  it('closes the review row with Cancel and books nothing', () => {
    const onSchedule = setup()
    fireEvent.click(choose(/Choose EL-2027-0001/))
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Review the booking' })).toBeNull()
    expect(onSchedule).not.toHaveBeenCalled()
  })

  it('makes Book the only filled button on the board', () => {
    setup()
    fireEvent.click(choose(/Choose EL-2027-0001/))
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    const filled = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-variant') === 'default')
    expect(filled.map((b) => b.textContent)).toEqual(['Book'])
  })

  it('shows Booking and disables the buttons while the booking is in flight', () => {
    setup(vi.fn(() => new Promise<boolean>(() => undefined)))
    fireEvent.click(choose(/Choose EL-2027-0001/))
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    book()
    const booking = screen.getByRole('button', { name: 'Booking' })
    expect(booking.hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /9:30 AM/ }).hasAttribute('disabled')).toBe(true)
  })

  it('clears the choice and the review once the booking succeeds', async () => {
    setup()
    fireEvent.click(choose(/Choose EL-2027-0001/))
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    book()
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Review the booking' })).toBeNull(),
    )
    expect(choose(/Choose EL-2027-0001/).getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps the review row open when the booking fails', async () => {
    setup(vi.fn(() => Promise.resolve(false)))
    fireEvent.click(choose(/Choose EL-2027-0001/))
    fireEvent.click(screen.getByRole('button', { name: /10:30 AM/ }))
    book()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Book' }).hasAttribute('disabled')).toBe(false),
    )
    expect(screen.getByRole('group', { name: 'Review the booking' })).toBeTruthy()
  })

  it('schedules into a later week after switching to it', () => {
    const onSchedule = setup()
    fireEvent.click(choose(/Choose EL-2027-0001/))
    fireEvent.click(within(weeks()).getByRole('button', { name: /Next week/ }))
    fireEvent.click(screen.getByRole('button', { name: /1:30 PM/ }))
    book()
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
    fireEvent.click(choose(/Choose BP-2027-0002/))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search requests' }), {
      target: { value: 'birch' },
    })
    fireEvent.click(screen.getByRole('button', { name: /1:30 PM/ }))
    book()
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ inspectionId: 'i2' }))
  })

  it('ignores j, s and / pressed on the page', () => {
    const onSchedule = setup()
    for (const k of ['j', 's', '/']) fireEvent.keyDown(document, { key: k })
    expect(onSchedule).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('ScheduleBoard request rows', () => {
  it('makes each request a native button so Enter and Space select it', () => {
    setup()
    for (const row of [/Choose EL-2027-0001/, /Choose BP-2027-0002/]) {
      const button = choose(row)
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button.getAttribute('role')).toBeNull()
    }
    expect(screen.queryByRole('option')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('selects from a click anywhere on the row but not from the number link', () => {
    setup()
    const row = choose(/Choose EL-2027-0001/).closest('li') as HTMLElement
    const link = within(row).getByRole('link', { name: 'EL-2027-0001, Rough' })
    link.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(link)
    expect(choose(/Choose EL-2027-0001/).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(row)
    expect(choose(/Choose EL-2027-0001/).getAttribute('aria-pressed')).toBe('true')
  })

  it('says which search matched nothing and keeps the waiting copy for an empty queue', () => {
    setup()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search requests' }), {
      target: { value: 'zzz' },
    })
    expect(screen.getByText('No request matches zzz.')).toBeTruthy()
    expect(screen.queryByText('No requests are waiting.')).toBeNull()
  })

  it('marks the chosen request’s preferred day among the times', () => {
    setup()
    expect(screen.queryByText('Preferred day')).toBeNull()
    fireEvent.click(choose(/Choose EL-2027-0001/))
    const row = screen.getByRole('listitem', { name: 'Wednesday, July 7, 2027, Ines Inspector' })
    expect(within(row).getByText('Preferred day')).toBeTruthy()
    const other = screen.getByRole('listitem', { name: 'Friday, July 9, 2027, Ines Inspector' })
    expect(within(other).queryByText('Preferred day')).toBeNull()
  })

  it('opens with the request named in the link already chosen', () => {
    setup(undefined, null, { initialChosenId: 'i2' })
    expect(choose(/Choose BP-2027-0002/).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Pick a time for BP-2027-0002, Framing.')).toBeTruthy()
    expect(
      within(weeks())
        .getByRole('button', { name: /Next week/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('moves focus to the times after choosing on a narrow screen only', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes('1023') }))
    vi.stubGlobal('matchMedia', matchMedia)
    setup()
    fireEvent.click(choose(/Choose EL-2027-0001/))
    expect(document.activeElement).toBe(screen.getByText('Pick a time for EL-2027-0001, Rough.'))
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.click(choose(/Choose BP-2027-0002/))
    expect(document.activeElement).not.toBe(
      screen.getByText('Pick a time for BP-2027-0002, Framing.'),
    )
    vi.unstubAllGlobals()
  })
})
