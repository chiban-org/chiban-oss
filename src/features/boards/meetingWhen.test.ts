import { describe, expect, it } from 'vitest'
import { meetingWhen, meetingWhenAndWhere, packetWhen } from '@/features/boards/meetingWhen'
import type { CivilDate } from '@/types/civilDate'

const DECEMBER_15 = '2026-12-15' as CivilDate

describe('when and where a board meeting is', () => {
  it('names the weekday, date, time and place', () => {
    expect(
      meetingWhenAndWhere({
        meetingDate: DECEMBER_15,
        startsAtMinute: 1140,
        location: 'Town Hall, Meeting Room 2',
      }),
    ).toBe('Tuesday, December 15, 2026 at 7:00 PM, Town Hall, Meeting Room 2')
  })

  it('leaves the place off when the town has not set one', () => {
    expect(
      meetingWhenAndWhere({ meetingDate: DECEMBER_15, startsAtMinute: 570, location: '' }),
    ).toBe('Tuesday, December 15, 2026 at 9:30 AM')
  })

  it('reads the civil date the same in any server time zone', () => {
    expect(meetingWhen({ meetingDate: '2027-01-01', startsAtMinute: 0 })).toBe(
      'Friday, January 1, 2027 at 12:00 AM',
    )
  })
})

describe('when a packet meeting is', () => {
  it('gives the weekday and date alone for a packet with no meeting on file', () => {
    expect(packetWhen({ meetingDate: DECEMBER_15, place: null })).toBe('Tuesday, December 15, 2026')
  })
})
