// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { DecisionView } from '@/features/decisions/decisionView'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../../hearings/decisionActions', () => ({ addAppealNodeAction: vi.fn() }))
vi.mock('@/components/appeals/AppealGraph', () => ({ AppealGraph: () => null }))

const { AppealsSection } = await import('./AppealsSection')
const { addAppealNodeAction } = await import('../../hearings/decisionActions')

afterEach(cleanup)

const view = {
  graph: [],
  nodeChoices: [{ id: 'n1', label: 'Decision of October 1' }],
} as unknown as DecisionView

describe('recording an appeal step', () => {
  it('shows a refused date beside the Date field', async () => {
    vi.mocked(addAppealNodeAction).mockResolvedValue(
      refusal('occurredOn', 'The date cannot be before the step it follows.'),
    )
    render(
      <CsrfProvider token="t">
        <AppealsSection view={view} today="2026-11-02" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Record an appeal step'))
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record' }),
      () => screen.getByLabelText(/^Date( \*)?$/),
      'The date cannot be before the step it follows.',
    )
  })
})
