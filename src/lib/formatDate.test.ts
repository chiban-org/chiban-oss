import { describe, expect, it } from 'vitest'
import type { CivilDate } from '@/types/civilDate'
import { formatCivilDate, formatInstant } from './formatDate'

describe('formatCivilDate', () => {
  it('writes the month in words without shifting the day', () => {
    expect(formatCivilDate('2027-05-20' as CivilDate)).toBe('May 20, 2027')
  })
})

describe('formatInstant', () => {
  it('writes the date and time in the town zone, not the server zone', () => {
    const instant = new Date('2026-11-02T03:30:00Z')
    expect(formatInstant(instant, 'America/New_York')).toBe('Nov 1, 2026, 10:30 PM')
    expect(formatInstant(instant, 'America/Los_Angeles')).toBe('Nov 1, 2026, 7:30 PM')
  })
})
