// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOOKINGS,
  boardRequest,
  DANA,
  OWED,
  REQUESTS,
  renderBoard,
} from '@/test/scheduleBoardFixtures'

afterEach(cleanup)

const waiting = () => screen.getByRole('region', { name: 'Waiting' })
const chip = (name: RegExp) => within(waiting()).getByRole('button', { name })
const prompt = () => screen.getByTestId('choice-prompt')

describe('the waiting row', () => {
  it('lists requests as chips, oldest first, and leaves bookings to the grid', () => {
    renderBoard()
    const names = within(waiting())
      .getAllByRole('button', { name: /^Choose / })
      .map((b) => b.querySelector('.font-semibold')?.textContent)
    expect(names).toEqual(['Choose EL-2027-0001, Rough', 'Choose BP-2027-0002, Framing'])
    expect(within(waiting()).getByRole('heading', { name: 'Waiting (2)' })).toBeTruthy()
    expect(within(waiting()).queryByText(/BP-2027-0010/)).toBeNull()
  })

  it('shows each chip’s address, channel, preferred day and reinspection in words, with no nested link', () => {
    renderBoard()
    const item = chip(/Choose BP-2027-0002, Framing/)
    for (const text of ['9 Birch Lane', 'Portal', 'Prefers July 12, 2027', 'Reinspection']) {
      expect(within(item).getByText(text)).toBeTruthy()
    }
    expect(within(waiting()).queryByRole('link')).toBeNull()
  })

  it('marks the chosen chip in words and names the request with a link to it', () => {
    renderBoard()
    expect(prompt().textContent).toBe('Choose a request, then an open time.')
    fireEvent.click(chip(/Choose EL-2027-0001/))
    expect(chip(/Choose EL-2027-0001/).getAttribute('aria-pressed')).toBe('true')
    expect(within(chip(/Choose EL-2027-0001/)).getByText('Chosen')).toBeTruthy()
    expect(prompt().textContent).toBe('Pick a time for EL-2027-0001, Rough.')
    expect(screen.getByRole('link', { name: 'View the inspection' }).getAttribute('href')).toBe(
      '/staff/inspections/i1',
    )
  })

  it('says so when nothing is waiting', () => {
    renderBoard({ requests: [] })
    expect(within(waiting()).getByText('No requests are waiting.')).toBeTruthy()
  })

  it('offers a filter only once more than eight are waiting', () => {
    renderBoard()
    expect(screen.queryByRole('searchbox')).toBeNull()
    cleanup()
    const many = Array.from({ length: 9 }, (_, n) =>
      boardRequest({ inspectionId: `m${n}`, address: n === 4 ? '4 Birch Lane' : `${n} Elm Road` }),
    )
    renderBoard({ requests: many })
    const filter = screen.getByRole('searchbox', { name: 'Search requests' })
    fireEvent.change(filter, { target: { value: 'birch' } })
    expect(within(waiting()).getAllByRole('button', { name: /^Choose / })).toHaveLength(1)
    fireEvent.change(filter, { target: { value: 'zzz' } })
    expect(within(waiting()).getByText('No request matches zzz.')).toBeTruthy()
  })

  it('puts Take a request ahead of the waiting row', () => {
    renderBoard({ takeRequest: <section aria-label="Take a request">lookup</section> })
    const take = screen.getByRole('region', { name: 'Take a request' })
    expect(take.compareDocumentPosition(waiting()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('moving a booking', () => {
  it('chooses a booked line for moving and names it with a link', () => {
    renderBoard()
    const line = screen.getByRole('button', { name: /^Move 10:00 AM BP-2027-0010/ })
    expect(line.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(line)
    expect(line.getAttribute('aria-pressed')).toBe('true')
    expect(prompt().textContent).toBe(
      'Moving BP-2027-0010, Framing, booked Wednesday 10:00 AM with Dana Inspector.',
    )
    expect(screen.getByRole('link', { name: 'View the inspection' }).getAttribute('href')).toBe(
      '/staff/inspections/b1',
    )
  })

  it('books the moved inspection with its own row version', () => {
    const onSchedule = renderBoard()
    fireEvent.click(screen.getByRole('button', { name: /^Move 10:00 AM BP-2027-0010/ }))
    fireEvent.click(screen.getByRole('button', { name: /^3 open, Wednesday/ }))
    fireEvent.click(screen.getByRole('button', { name: '9:00 AM, July 7, 2027, Ira Inspector' }))
    fireEvent.click(screen.getByRole('button', { name: 'Book' }))
    expect(onSchedule).toHaveBeenCalledWith({
      inspectionId: 'b1',
      rowVersion: 7,
      date: '2027-07-07',
      startMinute: 540,
      inspectorUserId: 'u2',
    })
  })

  it('does not offer the booking’s own time as a target', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('button', { name: /^Move 10:00 AM BP-2027-0010/ }))
    fireEvent.click(screen.getByRole('button', { name: /^\+2 open, Wednesday/ }))
    expect(screen.queryByRole('button', { name: /^10:00 AM, July 7, 2027, Dana/ })).toBeNull()
  })

  it('shows an owed booking named in the link as a waiting chip marked Result owed', () => {
    renderBoard({ bookings: [...BOOKINGS, OWED], initialChosenId: 'o1' })
    const owed = chip(/Choose EL-2027-0099, Service/)
    expect(within(owed).getByText('Result owed')).toBeTruthy()
    expect(owed.getAttribute('aria-pressed')).toBe('true')
    expect(prompt().textContent).toBe(
      `Moving EL-2027-0099, Service, booked Tuesday, June 29, 2027 at 9:30 AM with ${DANA.name}, result owed.`,
    )
    expect(within(waiting()).getByRole('heading', { name: 'Waiting (3)' })).toBeTruthy()
  })

  it('opens on a future booking named in the link, in its own week', () => {
    renderBoard({
      bookings: [
        ...BOOKINGS,
        { ...(BOOKINGS[0] as (typeof BOOKINGS)[0]), inspectionId: 'b5', date: '2027-07-16' },
      ],
      initialChosenId: 'b5',
    })
    expect(prompt().textContent).toMatch(/^Moving BP-2027-0010, Framing, booked Friday 10:00 AM/)
    expect(
      within(screen.getByRole('group', { name: 'Weeks' }))
        .getByRole('button', { name: /Next week/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('opens on the booking’s own week when its preferred day is off the board', () => {
    renderBoard({
      bookings: [
        ...BOOKINGS,
        {
          ...(BOOKINGS[0] as (typeof BOOKINGS)[0]),
          inspectionId: 'b6',
          date: '2027-07-16',
          preferredDate: '2027-06-01',
        },
      ],
      initialChosenId: 'b6',
    })
    expect(
      within(screen.getByRole('group', { name: 'Weeks' }))
        .getByRole('button', { name: /Next week/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('keeps chips as native buttons and ignores j, s and / pressed on the page', () => {
    const onSchedule = renderBoard({ requests: REQUESTS, onSchedule: vi.fn() })
    for (const k of ['j', 's', '/']) fireEvent.keyDown(document, { key: k })
    expect(onSchedule).not.toHaveBeenCalled()
    expect(chip(/Choose EL-2027-0001/).tagName).toBe('BUTTON')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
