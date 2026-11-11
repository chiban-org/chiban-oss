// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ReviewerWithComments } from '@/features/reviews/reviewerView'
import { findIsoDates, findRawKeys } from '@/test/leaks'

vi.mock('../../reviews/actions', () => ({
  assignReviewerAction: () => Promise.resolve({ ok: true, message: '' }),
  removeReviewerAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { ReviewersPanel } = await import('./reviewersPanel')

afterEach(cleanup)

const REVIEWERS: ReviewerWithComments[] = [
  {
    assignmentId: 'r1',
    reviewerUserId: 'u1',
    name: 'Remy Reviewer',
    status: 'commented',
    comments: [
      { body: 'Needs a stamped plan', createdAt: new Date('2027-03-04T15:30:00Z') },
      { body: 'Setback is fine', createdAt: new Date('2027-03-05T14:00:00Z') },
    ],
  },
  { assignmentId: 'r2', reviewerUserId: 'u2', name: 'Faye Fire', status: 'pending', comments: [] },
]

function renderPanel() {
  return render(
    <CsrfProvider token="t">
      <ReviewersPanel
        applicationId="a1"
        reviewers={REVIEWERS}
        choices={[]}
        canAssign={false}
        zone="America/New_York"
      />
    </CsrfProvider>,
  )
}

describe('reviewer comments on the application page', () => {
  it('shows each comment under its reviewer with the date and the review status', () => {
    renderPanel()
    const remy = screen.getByText('Remy Reviewer, Commented').closest('li')
    const faye = screen.getByText('Faye Fire, Pending').closest('li')
    if (remy === null || faye === null) throw new Error('two reviewers expected')
    expect(within(remy).getByText('Needs a stamped plan')).toBeTruthy()
    expect(within(remy).getByText('Setback is fine')).toBeTruthy()
    expect(within(remy).getByText(/March 4, 2027/)).toBeTruthy()
    expect(within(faye).getByText('No comments yet.')).toBeTruthy()
  })

  it('shows comment dates in words, never raw keys or ISO dates', () => {
    const { container } = renderPanel()
    expect(findIsoDates(container.textContent)).toEqual([])
    expect(findRawKeys(container.textContent, ['commented', 'signed_off'])).toEqual([])
  })
})
