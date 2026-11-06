// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { HearingView } from '@/features/hearings/views'
import { expectRefusalBeside, refusal } from '@/test/refusalBeside'

vi.mock('../actions', () => ({
  continueHearingAction: vi.fn(),
  markProperlyNoticedAction: vi.fn(),
  markHeldAction: vi.fn(),
}))

const { HearingRail } = await import('./HearingRail')
const { continueHearingAction } = await import('../actions')

afterEach(cleanup)

const view = {
  hearingId: 'h1',
  applicationId: 'a1',
  meetingId: 'm1',
  status: 'scheduled',
  checklist: [],
  noticedOn: null,
  otherMeetings: [{ id: 'm2', text: 'December 9, 2026' }],
  continuedFrom: null,
  continuedTo: null,
  announcedDetails: null,
  noticeRequired: false,
  boardName: 'Zoning Board',
  meetingText: 'November 12, 2026',
  typeLabel: 'Variance',
  applicationNumber: 'VAR-2026-0001',
} as unknown as HearingView

describe('continuing a hearing', () => {
  it('shows refused details beside the What was announced field', async () => {
    const message = 'Enter the date, time, and place that were announced at the meeting.'
    vi.mocked(continueHearingAction).mockResolvedValue(refusal('details', message))
    render(
      <CsrfProvider token="t">
        <HearingRail view={view} today="2026-11-02" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Continue to another meeting'))
    await expectRefusalBeside(
      screen.getByRole('button', { name: 'Continue hearing' }),
      () => screen.getByLabelText(/^What was announced( \*)?$/),
      message,
    )
  })
})
