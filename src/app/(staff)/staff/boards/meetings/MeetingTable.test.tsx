// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { MeetingListRow } from '@/features/boards/meetingList'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../actions', () => ({ cancelMeetingAction: vi.fn() }))

const { MeetingTable } = await import('./MeetingTable')
const { cancelMeetingAction } = await import('../actions')

afterEach(cleanup)

const rows = [
  {
    id: 'm1',
    meetingDate: '2026-12-09',
    board: 'zba',
    kind: 'regular',
    location: 'Town Hall',
    startsAtMinute: 1110,
    hearings: 0,
    agenda: 'none',
    cancelled: false,
    packetSent: false,
  },
] as unknown as MeetingListRow[]

describe('cancelling a meeting', () => {
  it('shows a refused reason beside the Reason field', async () => {
    vi.mocked(cancelMeetingAction).mockResolvedValue(
      refusal('reason', 'Enter a reason of 500 characters or fewer.'),
    )
    render(
      <CsrfProvider token="t">
        <MeetingTable
          rows={rows}
          links={{} as never}
          boardNames={new Map([['zba', 'Zoning Board']])}
          usualLocation="Town Hall"
          upcoming
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Cancel', { selector: 'summary' }))
    fireEvent.change(screen.getByLabelText(/^Reason( \*)?$/), { target: { value: 'x' } })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Cancel meeting' }),
      () => screen.getByLabelText(/^Reason( \*)?$/),
      'Enter a reason of 500 characters or fewer.',
    )
  })
})

describe('the meeting list', () => {
  it('shows each meeting start time beside its date', () => {
    render(
      <CsrfProvider token="t">
        <MeetingTable
          rows={rows}
          links={{} as never}
          boardNames={new Map([['zba', 'Zoning Board']])}
          usualLocation="Town Hall"
          upcoming
        />
      </CsrfProvider>,
    )
    expect(screen.getByText('6:30 PM')).toBeTruthy()
  })
})
