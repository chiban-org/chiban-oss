// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { DecisionView } from '@/features/decisions/decisionView'
import { expectRefusalBeside, refusal } from '@/test/refusalBeside'

vi.mock('../../hearings/decisionActions', () => ({ transmittalAction: vi.fn() }))
vi.mock('../../hearings/actions', () => ({ recordProofAction: vi.fn() }))
vi.mock('@/components/documents/ApplicationFileUploader', () => ({
  ApplicationFileUploader: () => null,
}))
vi.mock('@/components/notices/NoticeChecklist', () => ({ NoticeChecklist: () => null }))

const { TransmittalSection } = await import('./TransmittalSection')
const { recordProofAction } = await import('../../hearings/actions')

afterEach(cleanup)

const view = {
  decisionId: 'd1',
  applicationId: 'a1',
  transmittalStarted: true,
  transmittal: {
    checklist: [],
    itemChoices: [{ id: 'i1', label: 'Regional planning commission' }],
  },
  proofChoices: [{ id: 'f1', label: 'Receipt' }],
} as unknown as DecisionView

describe('regional transmittal proof', () => {
  it('shows a refused tracking number beside the Tracking number field', async () => {
    vi.mocked(recordProofAction).mockResolvedValue(
      refusal('reference', 'Enter the tracking number from the receipt.'),
    )
    render(
      <CsrfProvider token="t">
        <TransmittalSection view={view} today="2026-11-02" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Record proof of transmittal'))
    fireEvent.change(screen.getByLabelText(/^Certificate or receipt( \*)?$/), {
      target: { value: 'f1' },
    })
    await expectRefusalBeside(
      screen.getByRole('button', { name: 'Record proof' }),
      () => screen.getByLabelText(/^Tracking number( \*)?$/),
      'Enter the tracking number from the receipt.',
    )
  })
})
