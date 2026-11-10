import { describe, expect, it } from 'vitest'
import { temporaryUseRefusals } from '@/features/temporaryUse/limits'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const TODAY = d('2027-06-01')

function refusals(start: string, end: string, others: { start: string; end: string }[] = []) {
  return temporaryUseRefusals({
    start: d(start),
    end: d(end),
    today: TODAY,
    others: others.map((o) => ({ start: d(o.start), end: d(o.end) })),
  })
}

describe('temporaryUseRefusals', () => {
  it('accepts three consecutive days filed exactly 14 days ahead', () => {
    expect(refusals('2027-06-15', '2027-06-17')).toEqual([])
  })

  it('refuses a fourth consecutive day and says the limit', () => {
    const [text, ...rest] = refusals('2027-06-15', '2027-06-18')
    expect(rest).toEqual([])
    expect(text).toBe('A temporary use may run at most 3 consecutive days in any 30-day period.')
  })

  it('refuses a filing 13 days ahead and names the earliest start date', () => {
    const [text, ...rest] = refusals('2027-06-14', '2027-06-14')
    expect(rest).toEqual([])
    expect(text).toBe(
      'File at least 14 days before the start date. A filing made today can start no earlier than June 15, 2027.',
    )
  })

  it('explains both limits when both are broken', () => {
    expect(refusals('2027-06-05', '2027-06-09')).toHaveLength(2)
  })

  it('refuses an end date before the start date', () => {
    expect(refusals('2027-06-20', '2027-06-19')).toEqual(['The end date is before the start date.'])
  })

  it('refuses a second use on the same lot inside one 30-day period', () => {
    const [text] = refusals('2027-06-20', '2027-06-21', [
      { start: '2027-07-10', end: '2027-07-11' },
    ])
    expect(text).toBe(
      'This lot already has a temporary use from July 10, 2027 to July 11, 2027, and a lot may have at most 3 consecutive days of temporary use in any 30-day period.',
    )
  })

  it('allows a second use once the two fit no 30-day period together', () => {
    expect(
      refusals('2027-06-20', '2027-06-21', [{ start: '2027-07-20', end: '2027-07-21' }]),
    ).toEqual([])
  })
})
