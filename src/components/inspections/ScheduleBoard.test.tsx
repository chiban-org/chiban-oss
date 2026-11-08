// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BOOKINGS,
  boardRequest,
  DANA,
  DAYS,
  REQUESTS,
  renderBoard,
  slotDay,
} from '@/test/scheduleBoardFixtures'

afterEach(cleanup)

const chip = (pattern: RegExp) => screen.getByRole('button', { name: pattern })
const weeks = () => screen.getByRole('group', { name: 'Weeks' })
const prompt = () => screen.getByTestId('choice-prompt')
const book = () => fireEvent.click(screen.getByRole('button', { name: 'Book' }))

function pickWednesday() {
  fireEvent.click(chip(/Choose EL-2027-0001/))
  fireEvent.click(screen.getByRole('button', { name: /^\+2 open, Wednesday/ }))
  fireEvent.click(screen.getByRole('button', { name: '10:30 AM, July 7, 2027, Dana Inspector' }))
}

describe('ScheduleBoard weeks', () => {
  it('shows one week at a time and switches weeks from the week buttons', () => {
    renderBoard()
    const thisWeek = within(weeks()).getByRole('button', { name: /This week/ })
    const nextWeek = within(weeks()).getByRole('button', { name: /Next week/ })
    expect(thisWeek.getAttribute('aria-pressed')).toBe('true')
    expect(within(thisWeek).getByText('9 open')).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: /Jul 12/ })).toBeNull()
    fireEvent.click(nextWeek)
    expect(nextWeek.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('columnheader', { name: /Jul 12/ })).toBeTruthy()
    expect(screen.queryByRole('columnheader', { name: /Jul 7/ })).toBeNull()
  })

  it('steps between weeks with the earlier and later buttons', () => {
    renderBoard()
    const earlier = within(weeks()).getByRole('button', { name: 'Earlier week' })
    expect(earlier.hasAttribute('disabled')).toBe(true)
    fireEvent.click(within(weeks()).getByRole('button', { name: 'Later week' }))
    expect(screen.getByRole('columnheader', { name: /Jul 16/ })).toBeTruthy()
    expect(
      within(weeks()).getByRole('button', { name: 'Later week' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('names weeks after next by their Monday', () => {
    renderBoard({ days: [...DAYS, slotDay('2027-07-21', DANA, [570])] })
    expect(within(weeks()).getByRole('button', { name: /Week of Jul 19/ })).toBeTruthy()
  })

  it('opens on the week of the chosen request’s preferred day', () => {
    renderBoard()
    fireEvent.click(chip(/Choose BP-2027-0002/))
    expect(
      within(weeks())
        .getByRole('button', { name: /Next week/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('says so when there are no inspection days', () => {
    renderBoard({ days: [], bookings: [] })
    expect(screen.getByText('No inspection days in this range.')).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Weeks' })).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('opens with the request named in the link already chosen', () => {
    renderBoard({ initialChosenId: 'i2' })
    expect(chip(/Choose BP-2027-0002/).getAttribute('aria-pressed')).toBe('true')
    expect(prompt().textContent).toBe('Pick a time for BP-2027-0002, Framing.')
    expect(
      within(weeks())
        .getByRole('button', { name: /Next week/ })
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })
})

describe('ScheduleBoard booking', () => {
  it('opens a review row when a time is tapped and books nothing yet', () => {
    const onSchedule = renderBoard()
    pickWednesday()
    expect(onSchedule).not.toHaveBeenCalled()
    const review = screen.getByRole('group', { name: 'Review the booking' })
    expect(
      within(review).getByText('Book Wednesday, July 7, 2027 at 10:30 AM with Dana Inspector.'),
    ).toBeTruthy()
  })

  it('closes the review row with Cancel and books nothing', () => {
    const onSchedule = renderBoard()
    pickWednesday()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Review the booking' })).toBeNull()
    expect(onSchedule).not.toHaveBeenCalled()
  })

  it('makes Book the only filled button on the board', () => {
    renderBoard()
    pickWednesday()
    const filled = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('data-variant') === 'default')
    expect(filled.map((b) => b.textContent)).toEqual(['Book'])
  })

  it('shows Booking and disables the buttons while the booking is in flight', () => {
    renderBoard({ onSchedule: vi.fn(() => new Promise<boolean>(() => undefined)) })
    pickWednesday()
    book()
    expect(screen.getByRole('button', { name: 'Booking' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /^9:30 AM, July 7/ }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(screen.getByRole('button', { name: /^Move 9:00 AM/ }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('clears the choice and the review once the booking succeeds', async () => {
    renderBoard()
    pickWednesday()
    book()
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Review the booking' })).toBeNull(),
    )
    expect(chip(/Choose EL-2027-0001/).getAttribute('aria-pressed')).toBe('false')
  })

  it('keeps a request chosen while a booking was in flight when that booking succeeds', async () => {
    let finish: (ok: boolean) => void = () => undefined
    renderBoard({
      onSchedule: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve
          }),
      ),
    })
    pickWednesday()
    book()
    fireEvent.click(chip(/Choose BP-2027-0002/))
    finish(true)
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Review the booking' })).toBeNull(),
    )
    expect(chip(/Choose BP-2027-0002/).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the review row open when the booking fails', async () => {
    renderBoard({ onSchedule: vi.fn(() => Promise.resolve(false)) })
    pickWednesday()
    book()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Book' }).hasAttribute('disabled')).toBe(false),
    )
    expect(screen.getByRole('group', { name: 'Review the booking' })).toBeTruthy()
  })

  it('schedules into a later week after switching to it', () => {
    const onSchedule = renderBoard()
    fireEvent.click(chip(/Choose EL-2027-0001/))
    fireEvent.click(within(weeks()).getByRole('button', { name: /Next week/ }))
    fireEvent.click(screen.getByRole('button', { name: /^1 open, Monday, July 12, 2027, Ira/ }))
    fireEvent.click(screen.getByRole('button', { name: '1:30 PM, July 12, 2027, Ira Inspector' }))
    book()
    expect(onSchedule).toHaveBeenCalledWith({
      inspectionId: 'i1',
      rowVersion: 1,
      date: '2027-07-12',
      startMinute: 810,
      inspectorUserId: 'u2',
    })
  })

  it('keeps the chosen request when a search hides others', () => {
    const many = [
      ...REQUESTS,
      ...Array.from({ length: 7 }, (_, n) => boardRequest({ inspectionId: `m${n}` })),
    ]
    const onSchedule = renderBoard({ requests: many, bookings: BOOKINGS })
    fireEvent.click(chip(/Choose BP-2027-0002/))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search requests' }), {
      target: { value: 'elm' },
    })
    expect(screen.queryByRole('button', { name: /Choose BP-2027-0002/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^1 open, Monday, July 12, 2027, Dana/ }))
    fireEvent.click(screen.getByRole('button', { name: /^1:30 PM, July 12, 2027, Dana/ }))
    book()
    expect(onSchedule).toHaveBeenCalledWith(expect.objectContaining({ inspectionId: 'i2' }))
  })
})

describe('ScheduleBoard focus', () => {
  it('moves focus to the prompt after choosing on a narrow screen only', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('1023'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }))
    renderBoard()
    fireEvent.click(chip(/Choose EL-2027-0001/))
    expect(document.activeElement).toBe(prompt())
    cleanup()
    vi.unstubAllGlobals()
    renderBoard()
    fireEvent.click(chip(/Choose BP-2027-0002/))
    expect(document.activeElement).not.toBe(prompt())
  })
})
