// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScheduleBoard } from '@/components/inspections/ScheduleBoard'
import { TakeRequestPanel } from '@/components/inspections/TakeRequestPanel'
import { useTaken } from '@/components/inspections/takeRequestContext'
import {
  BOARD_TODAY,
  BOOKINGS,
  boardRequest,
  DANA,
  DAYS,
  IRA,
  NEXT_MONDAY,
  REQUESTS,
} from '@/test/scheduleBoardFixtures'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))

afterEach(cleanup)

function TakeStub({ id }: { id: string }) {
  const taken = useTaken()
  return (
    <button
      type="button"
      onClick={() => taken({ ok: true, message: 'Request taken.', createdId: id })}
    >
      Pretend to take
    </button>
  )
}

const NEW_REQUEST = boardRequest({
  inspectionId: 'i9',
  applicationNumber: 'BP-2027-0009',
  typeLabel: 'Final',
  preferredDate: NEXT_MONDAY,
})

function board(requests: typeof REQUESTS) {
  return (
    <ScheduleBoard
      requests={requests}
      bookings={BOOKINGS}
      days={DAYS}
      inspectors={[DANA, IRA]}
      today={BOARD_TODAY}
      takeRequest={
        <TakeRequestPanel defaultOpen>
          <TakeStub id="i9" />
        </TakeRequestPanel>
      }
      onSchedule={vi.fn(() => Promise.resolve(true))}
      message={null}
    />
  )
}

describe('ScheduleBoard after a request is taken', () => {
  it('chooses the new request on its preferred week, says so, and focuses the prompt', () => {
    const view = render(board(REQUESTS))
    fireEvent.click(screen.getByRole('button', { name: 'Pretend to take' }))
    view.rerender(board([...REQUESTS, NEW_REQUEST]))
    const chip = screen.getByRole('button', { name: /Choose BP-2027-0009/ })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    const prompt = screen.getByTestId('choice-prompt')
    expect(prompt.textContent).toBe('Pick a time for BP-2027-0009, Final.')
    expect(document.activeElement).toBe(prompt)
    expect(screen.getByRole('columnheader', { name: /Jul 12/ })).toBeTruthy()
    expect(screen.getByText('Request taken for BP-2027-0009, Final.')).toBeTruthy()
  })

  it('waits for the request to arrive before choosing it', () => {
    render(board(REQUESTS))
    fireEvent.click(screen.getByRole('button', { name: 'Pretend to take' }))
    expect(screen.getByTestId('choice-prompt').textContent).toBe(
      'Choose a request, then an open time.',
    )
    expect(screen.queryByText(/Request taken for/)).toBeNull()
  })

  it('drops the status line once another request is chosen', () => {
    const view = render(board(REQUESTS))
    fireEvent.click(screen.getByRole('button', { name: 'Pretend to take' }))
    view.rerender(board([...REQUESTS, NEW_REQUEST]))
    fireEvent.click(screen.getByRole('button', { name: /Choose EL-2027-0001/ }))
    expect(screen.queryByText(/Request taken for/)).toBeNull()
  })
})
