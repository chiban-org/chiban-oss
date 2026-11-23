import { describe, expect, it } from 'vitest'
import type { CivilDate } from '@/types/civilDate'
import { meLegalHolidays } from './holidays'

const dates = (year: number, opts?: Parameters<typeof meLegalHolidays>[1]) =>
  meLegalHolidays(year, opts).map((h) => h.date as string)

describe('Maine legal holidays', () => {
  it('lists the 2027 holidays with the Sunday observance', () => {
    expect([...dates(2027)].sort()).toEqual([
      '2027-01-01',
      '2027-01-18',
      '2027-02-15',
      '2027-04-19',
      '2027-05-31',
      '2027-06-19',
      '2027-07-04',
      '2027-07-05',
      '2027-09-06',
      '2027-10-11',
      '2027-11-11',
      '2027-11-25',
      '2027-12-25',
    ])
  })

  it('does not move a Saturday holiday', () => {
    expect(dates(2027)).not.toContain('2027-06-21')
    expect(dates(2027)).not.toContain('2027-12-27')
  })

  it('has no election day in any year', () => {
    for (const year of [2026, 2027, 2028]) {
      const november = dates(year).filter((d) => d.startsWith(`${String(year)}-11-0`))
      expect(november).toEqual([])
    }
  })

  it('names Patriot and Indigenous Peoples days', () => {
    const name = (date: string) => meLegalHolidays(2027).find((h) => h.date === date)?.name
    expect(name('2027-04-19')).toBe("Patriot's Day")
    expect(name('2027-10-11')).toBe('Indigenous Peoples Day')
    expect(name('2027-07-05')).toBe('Independence Day (observed)')
  })

  it('assumes the fourth Thursday for Thanksgiving and says so', () => {
    const thanksgiving = meLegalHolidays(2027).find((h) => h.date === '2027-11-25')
    expect(thanksgiving?.name).toBe('Thanksgiving (fourth Thursday, Chiban assumption)')
    expect(dates(2027)).not.toContain('2027-11-26')
  })

  it('uses a proclaimed Thanksgiving when given', () => {
    const list = dates(2027, { thanksgiving: new Map([[2027, '2027-11-18' as CivilDate]]) })
    expect(list).toContain('2027-11-18')
    expect(list).not.toContain('2027-11-25')
  })

  it('cites 4 MRSA §1051 on every day', () => {
    for (const h of meLegalHolidays(2027)) expect(h.citation).toBe('4 MRSA §1051')
  })
})
