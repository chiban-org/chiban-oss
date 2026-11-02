import { describe, expect, it } from 'vitest'
import { computeMeetingBoundDue, earliestNoticeableDate } from '@/features/clocks/meetingBound'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

describe('computeMeetingBoundDue', () => {
  it('is the meeting when the meeting falls inside the day limit', () => {
    expect(
      computeMeetingBoundDue({
        start: d('2027-03-24'),
        days: 30,
        noticeLeadDays: 10,
        nextRegularMeetingOnOrAfter: d('2027-04-14'),
      }),
    ).toEqual({
      due: '2027-04-14',
      nextNoticeableMeeting: '2027-04-14',
      dayLimit: '2027-04-23',
      basis: 'meeting',
    })
  })

  it('is the day limit when the next meeting is later, even on a Saturday', () => {
    expect(
      computeMeetingBoundDue({
        start: d('2027-05-27'),
        days: 30,
        noticeLeadDays: 10,
        nextRegularMeetingOnOrAfter: d('2027-07-14'),
      }),
    ).toEqual({
      due: '2027-06-26',
      nextNoticeableMeeting: '2027-07-14',
      dayLimit: '2027-06-26',
      basis: 'day_limit',
    })
  })

  it('is the day limit when there is no meeting', () => {
    const result = computeMeetingBoundDue({
      start: d('2027-03-24'),
      days: 30,
      noticeLeadDays: 10,
      nextRegularMeetingOnOrAfter: null,
    })
    expect(result.basis).toBe('day_limit')
    expect(result.nextNoticeableMeeting).toBeNull()
  })

  it('counts a meeting on the day limit as a meeting', () => {
    expect(
      computeMeetingBoundDue({
        start: d('2027-03-24'),
        days: 30,
        noticeLeadDays: 10,
        nextRegularMeetingOnOrAfter: d('2027-04-23'),
      }).basis,
    ).toBe('meeting')
  })

  it('a meeting is noticeable on the notice lead date itself', () => {
    expect(earliestNoticeableDate(d('2027-03-24'), 10)).toBe('2027-04-03')
  })
})
