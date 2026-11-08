// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BOARD_TODAY,
  BOOKINGS,
  DANA,
  DAYS,
  IRA,
  renderBoard,
  slotDay,
} from '@/test/scheduleBoardFixtures'

afterEach(cleanup)

const grid = () => screen.getByRole('table')

function cell(day: RegExp, who: string): HTMLElement {
  const headers = within(grid()).getAllByRole('columnheader')
  const column = headers.findIndex((h) => day.test(h.textContent))
  const row = within(grid()).getByRole('rowheader', { name: who }).closest('tr')
  const found = row?.children.item(column)
  if (column < 1 || !(found instanceof HTMLElement)) throw new Error(`no cell ${day} ${who}`)
  return found
}

const chooseFirst = () =>
  fireEvent.click(screen.getByRole('button', { name: /Choose EL-2027-0001/ }))
const openControl = (name: RegExp) => screen.getByRole('button', { name })

describe('the week grid', () => {
  it('has a column per date in the shown week, including a date holding only an off-grid booking', () => {
    renderBoard()
    const headers = within(grid())
      .getAllByRole('columnheader')
      .slice(1)
      .map((h) => h.textContent)
    expect(headers).toEqual(['Tue, Jul 6Today', 'Wed, Jul 7', 'Thu, Jul 8', 'Fri, Jul 9'])
  })

  it('has a row per inspector in the order given', () => {
    renderBoard({ inspectors: [IRA, DANA] })
    expect(
      within(grid())
        .getAllByRole('rowheader')
        .map((h) => h.textContent),
    ).toEqual([IRA.name, DANA.name])
  })

  it('lists a cell’s bookings by start time, then how many times are still open', () => {
    renderBoard()
    const wed = cell(/Jul 7/, DANA.name)
    const lines = within(wed)
      .getAllByRole('button', { name: /^Move / })
      .map((b) => b.textContent)
    expect(lines).toEqual([
      'Move 9:00 AM MG-2027-0011 Insulation',
      'Move 10:00 AM BP-2027-0010 Framing',
    ])
    expect(
      within(wed).getByRole('button', { name: /^\+2 open, Wednesday, July 7, 2027/ }),
    ).toBeTruthy()
  })

  it('says how many are open when nothing is booked, and Full when none are', () => {
    renderBoard()
    expect(within(cell(/Jul 7/, IRA.name)).getByRole('button', { name: /^3 open,/ })).toBeTruthy()
    const full = cell(/Jul 6/, IRA.name)
    expect(within(full).getByText('Full')).toBeTruthy()
    expect(within(full).queryByRole('button')).toBeNull()
  })

  it('offers no open times on a date that is not a scheduling day', () => {
    renderBoard()
    const thu = cell(/Jul 8/, IRA.name)
    expect(within(thu).getByRole('button', { name: /PL-2027-0012/ })).toBeTruthy()
    expect(within(thu).queryByRole('button', { name: /open/ })).toBeNull()
    expect(within(cell(/Jul 8/, DANA.name)).queryByRole('button')).toBeNull()
  })

  it('keeps the open controls disabled until a request is chosen', () => {
    renderBoard()
    const control = openControl(/^3 open, Wednesday/)
    expect(control.hasAttribute('disabled')).toBe(true)
    chooseFirst()
    expect(control.hasAttribute('disabled')).toBe(false)
  })

  it('expands one cell at a time to show its times', () => {
    renderBoard()
    chooseFirst()
    fireEvent.click(openControl(/^\+2 open, Wednesday/))
    expect(openControl(/^\+2 open, Wednesday/).getAttribute('aria-expanded')).toBe('true')
    expect(
      screen.getByRole('button', { name: '9:30 AM, July 7, 2027, Dana Inspector' }),
    ).toBeTruthy()
    fireEvent.click(openControl(/^3 open, Wednesday/))
    expect(
      screen.queryByRole('button', { name: '9:30 AM, July 7, 2027, Dana Inspector' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: '9:30 AM, July 7, 2027, Ira Inspector' }),
    ).toBeTruthy()
  })

  it('marks today’s column and the chosen request’s preferred day', () => {
    renderBoard()
    expect(screen.queryByText('Preferred day')).toBeNull()
    chooseFirst()
    const header = within(grid()).getByRole('columnheader', { name: /Jul 7/ })
    expect(within(header).getByText('Preferred day')).toBeTruthy()
    expect(cell(/Jul 7/, IRA.name).getAttribute('data-preferred')).toBe('true')
    expect(cell(/Jul 6/, IRA.name).getAttribute('data-today')).toBe('true')
  })

  it('opens the review row under the inspector’s row and books the picked time', () => {
    const onSchedule = renderBoard()
    chooseFirst()
    fireEvent.click(openControl(/^\+2 open, Wednesday/))
    fireEvent.click(screen.getByRole('button', { name: '10:30 AM, July 7, 2027, Dana Inspector' }))
    expect(
      screen
        .getByRole('button', { name: '10:30 AM, July 7, 2027, Dana Inspector' })
        .getAttribute('aria-pressed'),
    ).toBe('true')
    const review = screen.getByRole('group', { name: 'Review the booking' })
    const above = review.closest('tr')?.previousElementSibling as HTMLElement
    expect(within(above).getByRole('rowheader').textContent).toBe(DANA.name)
    fireEvent.click(within(review).getByRole('button', { name: 'Book' }))
    expect(onSchedule).toHaveBeenCalledWith({
      inspectionId: 'i1',
      rowVersion: 1,
      date: '2027-07-07',
      startMinute: 630,
      inspectorUserId: DANA.userId,
    })
  })

  it('shows only the dates a week has, such as a Monday and a Friday', () => {
    renderBoard()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Weeks' })).getByRole('button', {
        name: /Next week/,
      }),
    )
    const headers = within(grid())
      .getAllByRole('columnheader')
      .slice(1)
      .map((h) => h.textContent)
    expect(headers).toEqual(['Mon, Jul 12', 'Fri, Jul 16'])
  })

  it('adds a week that holds only a booking', () => {
    renderBoard({
      bookings: [
        ...BOOKINGS,
        { ...(BOOKINGS[0] as (typeof BOOKINGS)[0]), inspectionId: 'b9', date: '2027-07-21' },
      ],
      days: DAYS.filter((d) => d.date === BOARD_TODAY).concat(slotDay('2027-07-07', DANA, [])),
    })
    expect(
      within(screen.getByRole('group', { name: 'Weeks' })).getByRole('button', {
        name: /Week of Jul 19/,
      }),
    ).toBeTruthy()
  })
})
