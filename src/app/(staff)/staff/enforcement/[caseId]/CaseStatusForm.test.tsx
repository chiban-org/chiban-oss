// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../actions', () => ({ setCaseStatusAction: vi.fn() }))

const { CaseStatusForm } = await import('./CaseStatusForm')
const { setCaseStatusAction } = await import('../actions')

afterEach(cleanup)

describe('changing the case status', () => {
  it('shows a refused reason beside the reason field', async () => {
    vi.mocked(setCaseStatusAction).mockResolvedValue(
      refusal('reason', 'Enter a reason of 1000 characters or fewer.'),
    )
    renderForm(<CaseStatusForm detail={stubDetail()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change status' }))
    await expectRefusalBeside(
      screen.getByLabelText(/^Reason \(needed to close\)/),
      'Enter a reason of 1000 characters or fewer.',
    )
  })

  it('shows a refused status beside the status field', async () => {
    vi.mocked(setCaseStatusAction).mockResolvedValue(
      refusal('to', 'That step is not available from the current status.'),
    )
    renderForm(<CaseStatusForm detail={stubDetail()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change status' }))
    await expectRefusalBeside(
      screen.getByLabelText(/^Move the case to/),
      'That step is not available from the current status.',
    )
  })
})
