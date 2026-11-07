// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ApplicationBoardAssignment } from '@/features/reviews/boardAssignmentView'

vi.mock('../../reviews/actions', () => ({
  assignReviewerAction: () => Promise.resolve({ ok: true, message: '' }),
  removeReviewerAction: () => Promise.resolve({ ok: true, message: '' }),
  sendToBoardAction: () => Promise.resolve({ ok: true, message: '' }),
  withdrawBoardAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { ReviewersPanel } = await import('./reviewersPanel')

afterEach(cleanup)

const CONSERVATION: ApplicationBoardAssignment = {
  assignmentId: 'a1',
  boardId: 'b1',
  boardName: 'Alder Pond Conservation Commission',
  boardShortName: 'Conservation Commission',
  status: 'commented',
  statusLabel: 'Comments received',
  commentBy: '2026-11-20',
  comments: [
    {
      id: 'c1',
      body: 'Keep the 50 foot wetland buffer.',
      createdAt: new Date('2026-11-05T15:00:00Z'),
      attribution: 'Lee Marsh, Conservation Commission',
    },
  ],
}

const CHOICES = [
  { id: 'b1', name: 'Alder Pond Conservation Commission' },
  { id: 'b2', name: 'Alder Pond Historic District Commission' },
]

function renderPanel(canManage: boolean, assignments = [CONSERVATION]) {
  render(
    <CsrfProvider token="t">
      <ReviewersPanel
        applicationId="app"
        reviewers={[]}
        choices={[]}
        canAssign={false}
        boards={{ assignments, choices: CHOICES, canManage, zone: 'America/New_York' }}
      />
    </CsrfProvider>,
  )
}

describe('board assignments on the reviewers panel', () => {
  it('shows each board with its status, comment-by date and attributed comments', () => {
    renderPanel(false)
    const panel = screen.getByRole('region', { name: 'Reviewers' })
    expect(within(panel).getByText('Alder Pond Conservation Commission')).toBeTruthy()
    expect(within(panel).getByText('Comments received')).toBeTruthy()
    expect(within(panel).getByText('Comments by November 20, 2026')).toBeTruthy()
    const comments = within(panel).getByRole('list', {
      name: 'Comments from the Alder Pond Conservation Commission',
    })
    expect(comments.textContent).toContain('Keep the 50 foot wetland buffer.')
    expect(comments.textContent).toContain('Lee Marsh, Conservation Commission, ')
  })

  it('offers no send or withdraw to someone who cannot assign', () => {
    renderPanel(false)
    expect(screen.queryByText('Send to a board for comment')).toBeNull()
    expect(screen.queryByText('Withdraw')).toBeNull()
  })

  it('offers to send to a board not yet asked, with an optional comment-by date, and to withdraw', () => {
    renderPanel(true)
    expect(screen.getByText('Send to a board for comment')).toBeTruthy()
    const board = screen.getByLabelText<HTMLSelectElement>('Board')
    expect([...board.options].map((o) => o.text)).toEqual([
      'Alder Pond Historic District Commission',
    ])
    expect(screen.getByLabelText<HTMLInputElement>(/^Comment by/).type).toBe('date')
    expect(screen.getByLabelText('Withdraw Alder Pond Conservation Commission')).toBeTruthy()
  })

  it('reads Waiting for comments before any comment arrives', () => {
    renderPanel(false, [
      { ...CONSERVATION, status: 'pending', statusLabel: 'Waiting for comments', comments: [] },
    ])
    expect(screen.getByText('Waiting for comments')).toBeTruthy()
    expect(screen.queryByRole('list', { name: /^Comments from/ })).toBeNull()
  })
})
