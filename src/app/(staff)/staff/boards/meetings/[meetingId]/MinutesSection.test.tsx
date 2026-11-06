// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { MeetingMinutesView } from '@/features/boards/minutesView'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('./minutesActions', () => ({
  recordMinutesAction: vi.fn(),
  createMeetingUploadIntentAction: vi.fn(),
  finalizeMeetingUploadAction: vi.fn(),
}))
vi.mock('./MinutesUploader', () => ({ MinutesUploader: () => null }))

const { MinutesSection } = await import('./MinutesSection')
const { recordMinutesAction } = await import('./minutesActions')

afterEach(cleanup)

const minutes = {
  current: null,
  choices: [{ id: 'f1', label: 'Minutes of April 8' }],
} as unknown as MeetingMinutesView

describe('recording minutes', () => {
  it('shows a refused approval date beside the Date approved field', async () => {
    const message = 'Enter the date the board approved the minutes.'
    vi.mocked(recordMinutesAction).mockResolvedValue(refusal('approvedOn', message))
    render(
      <CsrfProvider token="t">
        <MinutesSection
          meetingId="m1"
          minutes={minutes}
          open
          meetingDate="2026-04-08"
          today="2026-11-02"
          canApprove
        />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByRole('combobox', { name: /^Minutes( \*)?$/ }), {
      target: { value: 'f1' },
    })
    fireEvent.change(screen.getByLabelText(/^Status( \*)?$/), { target: { value: 'approved' } })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record the minutes' }),
      () => screen.getByLabelText(/^Date approved( \*)?$/),
      message,
    )
  })
})
