// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import { AssignReviewerDialog } from './AssignReviewerDialog'

afterEach(cleanup)

const ROW = { applicationId: 'a1', number: 'SPR-2026-0003' } as WorkQueueRow

function renderDialog(ok: boolean, onClose: () => void) {
  const assign = vi.fn(() =>
    Promise.resolve(
      ok
        ? { ok: true as const, message: 'Reviewer assigned.' }
        : { ok: false as const, error: 'No.' },
    ),
  )
  render(
    <CsrfProvider token="t">
      <AssignReviewerDialog
        row={ROW}
        reviewers={[{ id: 'u1', name: 'Faye Fire' }]}
        assign={assign}
        onClose={onClose}
      />
    </CsrfProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Assign' }))
  return assign
}

describe('assign reviewer dialog', () => {
  it('closes once the reviewer is assigned', async () => {
    const onClose = vi.fn()
    const assign = renderDialog(true, onClose)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(assign).toHaveBeenCalledOnce()
  })

  it('stays open and shows the refusal when assigning fails', async () => {
    const onClose = vi.fn()
    renderDialog(false, onClose)
    await screen.findByText('No.')
    expect(onClose).not.toHaveBeenCalled()
  })
})
