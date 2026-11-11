// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('./actions', () => ({ recordAdministrativeDecisionAction: vi.fn() }))

const { RecordDecision } = await import('./RecordDecision')
const { recordAdministrativeDecisionAction } = await import('./actions')

afterEach(cleanup)

describe('recording an administrative decision', () => {
  it('shows an unknown number beside the number field', async () => {
    vi.mocked(recordAdministrativeDecisionAction).mockResolvedValue(
      refusal('applicationNumber', 'No application or permit has that number.'),
    )
    render(
      <CsrfProvider token="t">
        <RecordDecision today="2026-11-11" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Record an administrative decision' }))
    fireEvent.change(screen.getByLabelText(/^Application or permit number( \*)?$/), {
      target: { value: 'BP-1999-0000' },
    })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record the decision' }),
      () => screen.getByLabelText(/^Application or permit number( \*)?$/),
      'No application or permit has that number.',
    )
  })
})
