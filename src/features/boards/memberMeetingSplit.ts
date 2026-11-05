import type { MemberMeetingRow } from '@/features/boards/memberPackets'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export const MEMBER_BOARD_NAMES = {
  planning_board: 'Planning Board',
  zba: 'Zoning Board of Adjustment',
} as const

export interface MemberMeetingSplit {
  next: MemberMeetingRow | null
  later: MemberMeetingRow[]
  earlier: MemberMeetingRow[]
}

export function splitMemberMeetings(
  rows: readonly MemberMeetingRow[],
  today: CivilDate,
): MemberMeetingSplit {
  const upcoming = rows
    .filter((row) => row.meetingDate >= today)
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
  const next = upcoming.find((row) => !row.cancelled) ?? null
  return {
    next,
    later: upcoming.filter((row) => row !== next),
    earlier: rows.filter((row) => row.meetingDate < today),
  }
}

export function markerText(row: MemberMeetingRow): string | null {
  if (row.cancelled) return 'Cancelled'
  if (row.marker === null) return null
  return row.marker.kind === 'new' ? 'New' : `Updated ${formatCivilDate(row.marker.on)}`
}

export function meetingTitle(row: MemberMeetingRow): string {
  return `${MEMBER_BOARD_NAMES[row.board]}, ${formatCivilDate(row.meetingDate)}`
}
