import { describe, expect, it } from 'vitest'
import { markerText, splitMemberMeetings } from '@/features/boards/memberMeetingSplit'
import type { MemberMeetingRow } from '@/features/boards/memberPackets'
import type { CivilDate } from '@/types/civilDate'

function meeting(
  id: string,
  date: string,
  patch: Partial<MemberMeetingRow> = {},
): MemberMeetingRow {
  return {
    meetingId: id,
    board: 'planning_board',
    meetingDate: date as CivilDate,
    agendaDocumentId: null,
    cancelled: false,
    hasPacket: true,
    marker: null,
    ...patch,
  }
}

const TODAY = '2026-11-05' as CivilDate

describe('a board member start page', () => {
  it('picks the earliest meeting from today on as next, skipping cancelled ones', () => {
    const rows = [
      meeting('far', '2026-12-03'),
      meeting('soon', '2026-11-19'),
      meeting('off', '2026-11-12', { cancelled: true }),
      meeting('today', '2026-11-05', { cancelled: true }),
      meeting('past', '2026-10-15'),
    ]
    const split = splitMemberMeetings(rows, TODAY)
    expect(split.next?.meetingId).toBe('soon')
    expect(split.later.map((m) => m.meetingId)).toEqual(['today', 'off', 'far'])
    expect(split.earlier.map((m) => m.meetingId)).toEqual(['past'])
  })

  it('has no next meeting when none is coming up', () => {
    expect(splitMemberMeetings([meeting('past', '2026-10-15')], TODAY).next).toBeNull()
  })

  it('names a packet New, Updated with its date, or the meeting Cancelled', () => {
    expect(markerText(meeting('a', '2026-11-19', { marker: { kind: 'new' } }))).toBe('New')
    expect(
      markerText(
        meeting('b', '2026-11-19', { marker: { kind: 'updated', on: '2026-11-02' as CivilDate } }),
      ),
    ).toBe('Updated November 2, 2026')
    expect(markerText(meeting('c', '2026-11-19', { cancelled: true }))).toBe('Cancelled')
    expect(markerText(meeting('d', '2026-11-19'))).toBeNull()
  })
})
