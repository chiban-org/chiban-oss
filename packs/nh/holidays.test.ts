import { nhLegalHolidays } from '@packs/nh/holidays'
import { describe, expect, it } from 'vitest'

const dates = (year: number, opts?: Parameters<typeof nhLegalHolidays>[1]) =>
  nhLegalHolidays(year, opts).map((h) => h.date as string)

describe('NH legal holidays', () => {
  it('lists the 2027 holidays including the Sunday observance', () => {
    const list = dates(2027)
    for (const expected of [
      '2027-01-01',
      '2027-01-18',
      '2027-02-15',
      '2027-05-31',
      '2027-07-04',
      '2027-07-05',
      '2027-09-06',
      '2027-10-11',
      '2027-11-11',
      '2027-11-25',
      '2027-12-25',
    ]) {
      expect(list).toContain(expected)
    }
    expect(list.some((x) => x.startsWith('2027-11-0'))).toBe(false)
  })

  it('does not move a Saturday holiday', () => {
    expect(dates(2027)).not.toContain('2027-12-27')
  })

  it('includes the biennial election day in even years only', () => {
    expect(dates(2026)).toContain('2026-11-03')
    expect(dates(2028)).toContain('2028-11-07')
    expect(dates(2027)).not.toContain('2027-11-02')
  })

  it('does not treat the day after Thanksgiving as a holiday', () => {
    expect(dates(2027)).not.toContain('2027-11-26')
  })

  it('uses an appointed Thanksgiving when given', () => {
    const list = dates(2027, { thanksgiving: { 2027: '2027-11-18' as never } })
    expect(list).toContain('2027-11-18')
    expect(list).not.toContain('2027-11-25')
  })

  it('cites RSA 288:2 on observed days and carries election authority', () => {
    const observed = nhLegalHolidays(2027).find((h) => h.date === '2027-07-05')
    expect(observed?.citation).toBe('RSA 288:2')
    expect(nhLegalHolidays(2026).find((h) => h.date === '2026-11-03')?.name).toMatch(/election/i)
  })
})
