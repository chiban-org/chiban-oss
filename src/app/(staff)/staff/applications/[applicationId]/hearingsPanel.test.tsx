// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../../boards/hearings/actions', () => ({
  scheduleHearingAction: vi.fn(),
  routeToTrcAction: vi.fn(),
}))

const { HearingsPanel } = await import('./hearingsPanel')
const { scheduleHearingAction } = await import('../../boards/hearings/actions')

afterEach(cleanup)

const data = {
  applicationId: 'a1',
  hearings: [],
  decisions: [],
  trc: [],
  canSchedule: true,
  canRoute: false,
  scheduleMeetings: [{ id: 'm1', text: 'November 12, 2026' }],
  scheduleKinds: [['public_hearing', 'Public hearing']],
} as unknown as ApplicationHearingsPanel

describe('scheduling a hearing', () => {
  it('shows a refused meeting beside the Meeting field', async () => {
    const message = 'That meeting belongs to a different board than this application.'
    vi.mocked(scheduleHearingAction).mockResolvedValue(refusal('meetingId', message))
    render(
      <CsrfProvider token="t">
        <HearingsPanel data={data} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Schedule a hearing'))
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Schedule hearing' }),
      () => screen.getByLabelText(/^Meeting( \*)?$/),
      message,
    )
  })
})
