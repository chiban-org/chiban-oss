// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import { fillField, labelled, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../actions', () => ({ setCaseStatusAction: vi.fn() }))

const { CaseMoreActions, CloseForm, MoveForm } = await import('./CaseStatusForm')
const { setCaseStatusAction } = await import('../actions')

afterEach(cleanup)

describe('changing the case status', () => {
  it('shows a refused reason beside the reason field', async () => {
    vi.mocked(setCaseStatusAction).mockResolvedValue(
      refusal('reason', 'Enter a reason of 1000 characters or fewer.'),
    )
    renderForm(<CloseForm detail={stubDetail()} />)
    fillField(labelled('Reason for closing'), 'x')
    fireEvent.click(screen.getByRole('button', { name: 'Close the case' }))
    await expectRefusalBeside(
      screen.getByLabelText(labelled('Reason for closing')),
      'Enter a reason of 1000 characters or fewer.',
    )
  })

  it('shows a refused move in the form', async () => {
    vi.mocked(setCaseStatusAction).mockResolvedValue(
      refusal('to', 'That step is not available from the current status.'),
    )
    renderForm(<MoveForm detail={stubDetail()} to="resolved" variant="outline" />)
    fireEvent.click(screen.getByRole('button', { name: 'Resolve the case' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'That step is not available from the current status.',
      ),
    )
  })

  it('asks for a reason only once Close is chosen', () => {
    renderForm(<CaseMoreActions detail={stubDetail()} moves={['resolved', 'closed']} />)
    const close = screen.getByText('Close the case', { selector: 'summary' })
    expect(close.closest('details')?.hasAttribute('open')).toBe(false)
    expect(close.closest('details')?.querySelector('[name="reason"]')).not.toBeNull()
    const resolve = screen.getByRole('button', { name: 'Resolve the case' })
    expect(resolve.closest('form')?.querySelector('[name="reason"]')).toBeNull()
  })
})
