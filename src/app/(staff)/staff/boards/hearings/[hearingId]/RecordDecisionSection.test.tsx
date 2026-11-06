// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { HearingView } from '@/features/hearings/views'
import { expectRefusalBeside, refusal } from '@/test/refusalBeside'

vi.mock('../decisionActions', () => ({ recordDecisionAction: vi.fn() }))

const { RecordDecisionSection } = await import('./RecordDecisionSection')
const { recordDecisionAction } = await import('../decisionActions')

afterEach(cleanup)

const view = {
  applicationId: 'a1',
  hearingId: 'h1',
  defaultVotedOn: '2026-10-01',
  seatedMembers: ['Avery Stone', 'Robin Vale'],
} as unknown as HearingView

describe('recording the decision', () => {
  it('shows refused votes beside the votes field with its hint still described', async () => {
    const message = 'Enter one vote per line, like "Pat Rowe: for".'
    vi.mocked(recordDecisionAction).mockResolvedValue(refusal('votes', message))
    render(
      <CsrfProvider token="t">
        <RecordDecisionSection view={view} today="2026-11-02" />
      </CsrfProvider>,
    )
    fireEvent.change(screen.getByLabelText(/^Motion( \*)?$/), { target: { value: 'Approve' } })
    fireEvent.change(screen.getByLabelText(/^How each member voted( \*)?$/), {
      target: { value: 'Avery Stone' },
    })
    fireEvent.change(screen.getByLabelText(/^Findings of fact( \*)?$/), {
      target: { value: 'It meets the ordinance.' },
    })
    await expectRefusalBeside(
      screen.getByRole('button', { name: 'Record decision' }),
      () => screen.getByLabelText(/^How each member voted( \*)?$/),
      message,
    )
  })
})
