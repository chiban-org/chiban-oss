import { describe, expect, it } from 'vitest'
import { byNeed, memberRequestChip } from '@/features/reviews/memberRequestStatus'
import type { CivilDate } from '@/types/civilDate'

const TODAY = '2026-11-08' as CivilDate

function request(
  id: string,
  patch: { status?: string; commentBy?: string | null; commenters?: string[] } = {},
) {
  return { assignmentId: id, status: 'pending', commentBy: null, commenters: [], ...patch }
}

describe('a comment request as a board member sees it', () => {
  it('reads "No comments yet" while waiting, marked when the date has come', () => {
    expect(memberRequestChip(request('a', { commentBy: '2026-11-20' }), TODAY)).toEqual({
      status: 'neutral',
      label: 'No comments yet',
    })
    expect(memberRequestChip(request('b', { commentBy: '2026-11-08' }), TODAY)).toEqual({
      status: 'overdue',
      label: 'No comments yet',
    })
  })

  it('names who commented once the board has', () => {
    expect(
      memberRequestChip(
        request('c', { status: 'commented', commenters: ['Cleo Marsh', 'Lee Marsh'] }),
        TODAY,
      ),
    ).toEqual({ status: 'passed', label: 'Your board commented (Cleo Marsh, Lee Marsh)' })
    expect(memberRequestChip(request('d', { status: 'commented' }), TODAY)).toEqual({
      status: 'passed',
      label: 'Your board commented',
    })
  })

  it('sorts waiting requests first by date, undated waiting next, commented last', () => {
    const rows = [
      request('done', { status: 'commented', commentBy: '2026-11-01', commenters: ['Cleo Marsh'] }),
      request('undated'),
      request('late', { commentBy: '2026-12-01' }),
      request('soon', { commentBy: '2026-11-10' }),
    ]
    expect(byNeed(rows).map((r) => r.assignmentId)).toEqual(['soon', 'late', 'undated', 'done'])
  })
})
