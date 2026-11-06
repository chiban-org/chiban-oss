// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { DecisionView } from '@/features/decisions/decisionView'
import { expectRefusalBeside, refusal } from '@/test/refusalBeside'

vi.mock('../../hearings/decisionActions', () => ({ fileDecisionAction: vi.fn() }))
vi.mock('@/components/documents/ApplicationFileUploader', () => ({
  ApplicationFileUploader: () => null,
}))

const { FilingSection } = await import('./FilingSection')
const { fileDecisionAction } = await import('../../hearings/decisionActions')

afterEach(cleanup)

const view = {
  decisionId: 'd1',
  applicationId: 'a1',
  votedOn: '2026-10-01',
  filedText: null,
  documentsGenerated: true,
  minutesChoices: [{ id: 'm1', label: 'Minutes of October 1' }],
} as unknown as DecisionView

describe('filing the decision', () => {
  it('shows a refused filing date beside the Date filed field', async () => {
    vi.mocked(fileDecisionAction).mockResolvedValue(
      refusal('filedOn', 'The decision cannot be filed before the date of the vote.'),
    )
    render(
      <CsrfProvider token="t">
        <FilingSection view={view} today="2026-11-02" />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText(/^Minutes( \*)?$/), { target: { value: 'm1' } })
    await expectRefusalBeside(
      screen.getByRole('button', { name: 'File the decision' }),
      () => screen.getByLabelText(/^Date filed( \*)?$/),
      'The decision cannot be filed before the date of the vote.',
    )
  })
})
