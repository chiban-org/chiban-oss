import { describe, expect, it } from 'vitest'
import { formatCivilDate, formatInstant, formatInstantDate } from './formatDate'

describe('formatCivilDate', () => {
  it('writes the month in words without shifting the day', () => {
    expect(formatCivilDate('2027-05-20')).toBe('May 20, 2027')
  })
})

describe('formatInstant', () => {
  it('writes the date and time in the town zone, not the server zone', () => {
    const instant = new Date('2026-11-02T03:30:00Z')
    expect(formatInstant(instant, 'America/New_York')).toBe('Nov 1, 2026, 10:30 PM')
    expect(formatInstant(instant, 'America/Los_Angeles')).toBe('Nov 1, 2026, 7:30 PM')
  })
})

describe('formatInstantDate', () => {
  it('writes the long date for the town zone, not the server zone', () => {
    const instant = new Date('2026-11-02T03:30:00Z')
    expect(formatInstantDate(instant, 'America/New_York')).toBe('November 1, 2026')
    expect(formatInstantDate(instant, 'America/Los_Angeles')).toBe('November 1, 2026')
    expect(formatInstantDate(new Date('2026-11-02T12:00:00Z'), 'America/New_York')).toBe(
      'November 2, 2026',
    )
  })
})
