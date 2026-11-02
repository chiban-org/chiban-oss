import { describe, expect, it } from 'vitest'
import { civilYear, parseCivilDate, todayInTimeZone } from '@/types/civilDate'

describe('civil dates', () => {
  it('today in New York before UTC midnight rolls back a day', () => {
    expect(todayInTimeZone('America/New_York', new Date('2027-03-02T03:30:00Z'))).toBe('2027-03-01')
  })

  it('rejects an impossible date', () => {
    expect(parseCivilDate('2027-02-30')).toEqual({ ok: false, error: 'invalid_date' })
  })

  it('accepts a real date and reads its year', () => {
    const r = parseCivilDate('2028-02-29')
    expect(r.ok).toBe(true)
    if (r.ok) expect(civilYear(r.value)).toBe(2028)
  })
})
