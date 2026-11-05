import { describe, expect, it } from 'vitest'
import {
  firstOpenWeek,
  groupSlotWeeks,
  openCountText,
  weekdayName,
  weekStart,
} from '@/features/inspections/slotWeeks'
import type { CivilDate } from '@/types/civilDate'

const today = '2026-11-05' as CivilDate

function day(date: string, free: number[] = [570]) {
  return { date, freeStarts: free }
}

describe('groupSlotWeeks', () => {
  it('starts weeks on Monday', () => {
    expect(weekStart('2026-11-05' as CivilDate)).toBe('2026-11-02')
    expect(weekStart('2026-11-08' as CivilDate)).toBe('2026-11-02')
    expect(weekStart('2026-11-09' as CivilDate)).toBe('2026-11-09')
  })

  it('names this week, next week, and later weeks by their Monday', () => {
    const weeks = groupSlotWeeks(
      [day('2026-11-06'), day('2026-11-09'), day('2026-11-13'), day('2026-11-18')],
      today,
    )
    expect(weeks.map((w) => w.label)).toEqual([
      'This week',
      'Next week',
      'Week of November 16, 2026',
    ])
    expect(weeks[1]?.days.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-13'])
  })

  it('counts open slots per week and makes no tab for a week without inspection days', () => {
    const weeks = groupSlotWeeks([day('2026-11-06', [570, 630]), day('2026-11-23', [])], today)
    expect(weeks.map((w) => [w.label, w.open])).toEqual([
      ['This week', 2],
      ['Week of November 23, 2026', 0],
    ])
  })

  it('opens on the first week with an open slot, or the first week when all are full', () => {
    const full = groupSlotWeeks([day('2026-11-06', []), day('2026-11-09')], today)
    expect(firstOpenWeek(full)).toBe('2026-11-09')
    expect(firstOpenWeek(groupSlotWeeks([day('2026-11-06', [])], today))).toBe('2026-11-02')
    expect(firstOpenWeek(groupSlotWeeks([], today))).toBeNull()
  })

  it('reads a full week or day as Full, never as zero open', () => {
    expect(openCountText(0)).toBe('Full')
    expect(openCountText(6)).toBe('6 open')
    expect(weekdayName('2026-11-06')).toBe('Friday')
  })
})
