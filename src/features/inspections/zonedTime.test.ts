import { describe, expect, it } from 'vitest'
import { localToUtc, utcToLocal } from '@/features/inspections/zonedTime'
import type { CivilDate } from '@/types/civilDate'

const ZONE = 'America/New_York'
const d = (s: string) => s as CivilDate

describe('zoned time', () => {
  it('local slot converts across the November DST change', () => {
    expect(localToUtc(d('2027-11-05'), 570, ZONE).toISOString()).toBe('2027-11-05T13:30:00.000Z')
    expect(localToUtc(d('2027-11-08'), 570, ZONE).toISOString()).toBe('2027-11-08T14:30:00.000Z')
  })

  it('utcToLocal round-trips every slot start on 2027-03-15 and 2027-11-08', () => {
    for (const date of ['2027-03-15', '2027-11-08']) {
      for (const minute of [570, 630, 690, 750, 810, 870]) {
        const instant = localToUtc(d(date), minute, ZONE)
        expect(utcToLocal(instant, ZONE)).toEqual({ date, minute })
      }
    }
  })

  it('nonexistent 02:30 on 2027-03-14 resolves to 07:30Z', () => {
    expect(localToUtc(d('2027-03-14'), 150, ZONE).toISOString()).toBe('2027-03-14T07:30:00.000Z')
  })

  it('an ambiguous 01:30 on 2027-11-07 resolves to the earlier instant', () => {
    expect(localToUtc(d('2027-11-07'), 90, ZONE).toISOString()).toBe('2027-11-07T05:30:00.000Z')
  })
})
