import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  civilDate,
  EARLIEST_CIVIL_DATE,
  endNotBefore,
  LATEST_CIVIL_DATE,
  optionalCivilDate,
} from '@/features/input/schemas'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

function verdict(schema: z.ZodType, raw: unknown) {
  const parsed = schema.safeParse(raw)
  return parsed.success ? { value: parsed.data } : { message: parsed.error.issues[0]?.message }
}

describe('civilDate', () => {
  const observed = civilDate('the observed date')

  it('defaults its bounds to 1900-01-01 through 2099-12-31', () => {
    expect([EARLIEST_CIVIL_DATE, LATEST_CIVIL_DATE]).toEqual(['1900-01-01', '2099-12-31'])
    expect(verdict(observed, '1900-01-01')).toEqual({ value: '1900-01-01' })
    expect(verdict(observed, '2099-12-31')).toEqual({ value: '2099-12-31' })
  })

  it('refuses a year 9999 or 1899 date and names the allowed range', () => {
    for (const raw of ['9999-12-31', '1899-12-31'])
      expect(verdict(observed, raw)).toEqual({
        message: 'Enter the observed date between January 1, 1900 and December 31, 2099.',
      })
  })

  it('refuses impossible, malformed and missing dates', () => {
    for (const raw of ['2027-02-30', 'next Tuesday', '11/06/2026'])
      expect(verdict(observed, raw)).toEqual({ message: 'Enter the observed date as a date.' })
    for (const raw of ['', '  ', undefined])
      expect(verdict(observed, raw)).toEqual({ message: 'Enter the observed date.' })
  })

  it('takes per-field bounds such as no later than the town today', () => {
    const referral = civilDate('the referral date', { latest: d('2026-11-06') })
    expect(verdict(referral, '2026-11-06')).toEqual({ value: '2026-11-06' })
    expect(verdict(referral, '2026-11-07')).toEqual({
      message: 'Enter the referral date between January 1, 1900 and November 6, 2026.',
    })
    const later = civilDate('the hearing date', { earliest: d('2026-11-06') })
    expect(verdict(later, '2026-11-05')).toEqual({
      message: 'Enter the hearing date between November 6, 2026 and December 31, 2099.',
    })
  })
})

describe('optionalCivilDate', () => {
  it('turns blank into null and bounds a given date', () => {
    const end = optionalCivilDate('the term end date')
    expect(verdict(end, ' ')).toEqual({ value: null })
    expect(verdict(end, '2030-03-31')).toEqual({ value: '2030-03-31' })
    expect(verdict(end, '9999-01-01')).toEqual({
      message: 'Enter the term end date between January 1, 1900 and December 31, 2099.',
    })
  })
})

describe('endNotBefore', () => {
  const term = z
    .object({ termStart: civilDate('the term start date'), termEnd: optionalCivilDate('x') })
    .superRefine(endNotBefore('termStart', 'termEnd', 'The term cannot end before it starts.'))

  it('puts the ordering message on the end field', () => {
    const parsed = term.safeParse({ termStart: '2026-11-01', termEnd: '2026-10-01' })
    expect(parsed.success ? [] : parsed.error.issues.map((i) => [i.path, i.message])).toEqual([
      [['termEnd'], 'The term cannot end before it starts.'],
    ])
  })

  it('accepts an end on the start day, after it, or no end at all', () => {
    for (const termEnd of ['2026-11-01', '2027-10-31', ''])
      expect(term.safeParse({ termStart: '2026-11-01', termEnd }).success).toBe(true)
  })
})
