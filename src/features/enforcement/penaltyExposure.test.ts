import { describe, expect, it } from 'vitest'
import { penaltyExposure } from '@/features/enforcement/penaltyExposure'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const rule = (() => {
  const found = ruleByKey(loadPack(), 'nh.enf.penalty_zoning')
  if (found.kind !== 'civil_penalty') throw new Error('rule')
  return found
})()

describe('penaltyExposure', () => {
  it('first offense from notice received 2027-02-10 through 2027-02-20 is 10 days and 275000 cents', () => {
    const result = penaltyExposure(rule, {
      noticeReceivedOn: d('2027-02-10'),
      convictedOn: null,
      through: d('2027-02-20'),
      offense: 'first',
    })
    expect(result).toMatchObject({ fromDate: '2027-02-10', days: 10, cents: 275000 })
  })

  it('subsequent offense over the same days is 550000 cents', () => {
    const result = penaltyExposure(rule, {
      noticeReceivedOn: d('2027-02-10'),
      convictedOn: null,
      through: d('2027-02-20'),
      offense: 'subsequent',
    })
    expect(result.cents).toBe(550000)
  })

  it('conviction earlier than notice starts accrual at conviction', () => {
    const result = penaltyExposure(rule, {
      noticeReceivedOn: d('2027-02-10'),
      convictedOn: d('2027-02-05'),
      through: d('2027-02-20'),
      offense: 'first',
    })
    expect(result).toMatchObject({ fromDate: '2027-02-05', days: 15, cents: 412500 })
  })

  it('no notice and no conviction is 0 days with a null fromDate', () => {
    const result = penaltyExposure(rule, {
      noticeReceivedOn: null,
      convictedOn: null,
      through: d('2027-02-20'),
      offense: 'first',
    })
    expect(result).toMatchObject({ fromDate: null, days: 0, cents: 0 })
  })

  it('a through date before the start is zero days', () => {
    const result = penaltyExposure(rule, {
      noticeReceivedOn: d('2027-03-10'),
      convictedOn: null,
      through: d('2027-02-20'),
      offense: 'first',
    })
    expect(result).toMatchObject({ fromDate: '2027-03-10', days: 0, cents: 0 })
  })

  it('the label says nothing is owed unless a court imposes it', () => {
    const result = penaltyExposure(rule, {
      noticeReceivedOn: d('2027-02-10'),
      convictedOn: null,
      through: d('2027-02-20'),
      offense: 'first',
    })
    expect(result.label).toBe(
      'Estimated statutory exposure for counsel. Nothing is owed unless a court imposes it.',
    )
  })
})
