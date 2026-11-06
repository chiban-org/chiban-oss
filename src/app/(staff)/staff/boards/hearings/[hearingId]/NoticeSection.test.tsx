// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { HearingView } from '@/features/hearings/views'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../actions', () => ({ recordProofAction: vi.fn() }))
vi.mock('./uploads', () => ({
  createStaffUploadIntentAction: vi.fn(),
  finalizeStaffUploadAction: vi.fn(),
}))
vi.mock('@/components/documents/ApplicationFileUploader', () => ({
  ApplicationFileUploader: () => null,
}))
vi.mock('@/components/notices/NoticeChecklist', () => ({ NoticeChecklist: () => null }))

const { NoticeSection } = await import('./NoticeSection')
const { recordProofAction } = await import('../actions')

afterEach(cleanup)

const view = {
  applicationId: 'a1',
  hearingId: 'h1',
  status: 'scheduled',
  checklist: [],
  itemChoices: [{ id: 'i1', label: 'Abutter notice' }],
  documentChoices: [{ id: 'f1', label: 'Certificate' }],
} as unknown as HearingView

describe('proof of notice', () => {
  it('shows a refused date beside the date field', async () => {
    vi.mocked(recordProofAction).mockResolvedValue(
      refusal('effectiveOn', 'The date cannot be in the future.'),
    )
    render(
      <CsrfProvider token="t">
        <NoticeSection view={view} today="2026-11-02" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Record proof of notice'))
    fireEvent.change(screen.getByLabelText(/^Certificate or receipt( \*)?$/), {
      target: { value: 'f1' },
    })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record proof' }),
      () => screen.getByLabelText(/^Date of mailing, posting, or publication( \*)?$/),
      'The date cannot be in the future.',
    )
  })
})
