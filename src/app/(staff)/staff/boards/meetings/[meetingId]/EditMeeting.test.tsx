// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('./editActions', () => ({ updateMeetingAction: vi.fn() }))

const { EditMeeting } = await import('./EditMeeting')
const { updateMeetingAction } = await import('./editActions')

afterEach(cleanup)

function open() {
  render(
    <CsrfProvider token="t">
      <EditMeeting meetingId="m1" startsAtMinute={1110} location="Library" />
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Change time or place' }))
}

describe('changing a meeting time or place', () => {
  it('opens with the stored start time and location filled in', () => {
    open()
    expect(screen.getByLabelText<HTMLInputElement>(/^Start time( \*)?$/).value).toBe('18:30')
    expect(screen.getByLabelText<HTMLInputElement>(/^Location( \*)?$/).value).toBe('Library')
    expect(screen.getByText(/Notices already mailed keep the old time/)).toBeTruthy()
  })

  it('shows a refused start time beside the Start time field', async () => {
    vi.mocked(updateMeetingAction).mockResolvedValue(
      refusal('startsAt', 'Enter the start time as a time of day, like 7:00 PM.'),
    )
    open()
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Save' }),
      () => screen.getByLabelText(/^Start time( \*)?$/),
      'Enter the start time as a time of day, like 7:00 PM.',
    )
  })
})
