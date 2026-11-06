// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { BoardPanelData } from '@/features/boards/panelData'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../../boards/actions', () => ({
  certificationAction: vi.fn(),
  finalApprovalAction: vi.fn(),
}))

const { DecisionSection } = await import('./boardDecisionSection')
const { certificationAction, finalApprovalAction } = await import('../../boards/actions')

afterEach(cleanup)

const base = {
  applicationId: 'a1',
  canRecord: true,
  today: '2026-11-02',
  state: 'decided',
  hasExercise: false,
  exerciseText: null,
  certification: { offered: false, history: [] },
}

function render2(data: object) {
  render(
    <CsrfProvider token="t">
      <DecisionSection data={data as BoardPanelData} />
    </CsrfProvider>,
  )
}

describe('decision follow-up refusals', () => {
  it('shows a refused decided date beside the Date decided field', async () => {
    const message = 'Enter the date decided as a date.'
    vi.mocked(certificationAction).mockResolvedValue(refusal('decidedOn', message))
    render2({ ...base, certification: { offered: true, history: [] } })
    fireEvent.click(screen.getByText('Record a request to the selectmen'))
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record' }),
      () => screen.getByLabelText(/^Date decided, if certified( \*)?$/),
      message,
    )
  })

  it('shows a refused final approval date beside the Date of final approval field', async () => {
    const message = 'The date cannot be in the future.'
    vi.mocked(finalApprovalAction).mockResolvedValue(refusal('finalOn', message))
    render2({ ...base, hasExercise: true })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record final approval' }),
      () => screen.getByLabelText(/^Date of final approval( \*)?$/),
      message,
    )
  })
})
