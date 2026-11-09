import { describe, expect, it } from 'vitest'
import {
  formatCivilDate,
  formatCivilDateShort,
  formatCivilDateWithWeekday,
  formatInstant,
  formatInstantDate,
  formatInstantOrNever,
  humanizeIsoDates,
} from './formatDate'

describe('formatInstantOrNever', () => {
  it('writes date and time in the zone, or Never for null', () => {
    expect(formatInstantOrNever(new Date('2026-11-02T15:30:00Z'), 'America/New_York')).toBe(
      'November 2, 2026, 10:30 AM',
    )
    expect(formatInstantOrNever(null, 'America/New_York')).toBe('Never')
  })
})

describe('humanizeIsoDates', () => {
  it('rewrites every ISO date inside a sentence and leaves other text alone', () => {
    expect(
      humanizeIsoDates('30 calendar days after 2026-11-02 and before 2026-12-02 (RSA 21:35 I).'),
    ).toBe('30 calendar days after November 2, 2026 and before December 2, 2026 (RSA 21:35 I).')
  })

  it('leaves an impossible date as written', () => {
    expect(humanizeIsoDates('see 2026-13-45')).toBe('see 2026-13-45')
  })
})

describe('formatCivilDate', () => {
  it('writes the month in words without shifting the day', () => {
    expect(formatCivilDate('2027-05-20')).toBe('May 20, 2027')
  })
})

describe('formatCivilDateWithWeekday', () => {
  it('leads with the weekday without shifting the day', () => {
    expect(formatCivilDateWithWeekday('2026-11-18')).toBe('Wednesday, November 18, 2026')
  })
})

describe('formatCivilDateShort', () => {
  it('abbreviates the month without shifting the day', () => {
    expect(formatCivilDateShort('2026-11-01')).toBe('Nov 1, 2026')
    expect(formatCivilDateShort('2027-05-20')).toBe('May 20, 2027')
  })
})

describe('formatInstant', () => {
  it('writes the date and time in the town zone, not the server zone', () => {
    const instant = new Date('2026-11-02T03:30:00Z')
    expect(formatInstant(instant, 'America/New_York')).toBe('November 1, 2026, 10:30 PM')
    expect(formatInstant(instant, 'America/Los_Angeles')).toBe('November 1, 2026, 7:30 PM')
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
