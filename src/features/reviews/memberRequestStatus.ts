import type { Status } from '@/features/design/tokens'
import type { CivilDate } from '@/types/civilDate'

export interface MemberRequestState {
  status: string
  commentBy: string | null
  commenters: string[]
}

export function memberRequestChip(
  row: MemberRequestState,
  today: CivilDate,
): { status: Status; label: string } {
  if (row.status === 'commented') {
    return {
      status: 'passed',
      label:
        row.commenters.length === 0
          ? 'Your board commented'
          : `Your board commented (${row.commenters.join(', ')})`,
    }
  }
  const due = row.commentBy !== null && row.commentBy <= today
  return { status: due ? 'overdue' : 'neutral', label: 'No comments yet' }
}

function needRank(row: MemberRequestState): number {
  if (row.status === 'commented') return 2
  return row.commentBy === null ? 1 : 0
}

export function byNeed<T extends MemberRequestState>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const rank = needRank(a) - needRank(b)
    if (rank !== 0) return rank
    return (a.commentBy ?? '').localeCompare(b.commentBy ?? '')
  })
}
