import { describe, expect, it } from 'vitest'
import { AppError } from '@/constants/errorIds'
import { computeSubjectDue, subjectDueStatus } from '@/features/clocks/subjectDue'
import { PACK_COUNTING_CITATIONS, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const ctx = () => ({
  holidays: packHolidayCalendar(),
  packVersion: loadPack().version,
  citations: PACK_COUNTING_CITATIONS,
})
const clock = (key: string) => {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'clock') throw new Error('not a clock')
  return rule
}

describe('stated date rules', () => {
  const stated = () => clock('nh.rtk.stated_time')

  it('stated date before the statement date is rejected', () => {
    expect(() =>
      computeSubjectDue(stated(), d('2027-07-02'), ctx(), { statedDue: d('2027-07-01') }),
    ).toThrow(AppError)
  })

  it('stated date on the statement date is accepted and kept as the due date', () => {
    const due = computeSubjectDue(stated(), d('2027-07-02'), ctx(), {
      statedDue: d('2027-07-20'),
    })
    expect(due.due).toBe('2027-07-20')
    expect(due.rolledFrom).toBeNull()
    expect(due.startEvent).toBe('rtk_time_statement')
  })

  it('a stated date rule without a stated date is rejected', () => {
    expect(() => computeSubjectDue(stated(), d('2027-07-02'), ctx())).toThrow(AppError)
  })
})

describe('computeSubjectDue', () => {
  it('answer due rolls from Sunday 2027-03-21 to 2027-03-22', () => {
    const due = computeSubjectDue(clock('nh.enf.answer_zoning'), d('2027-03-01'), ctx())
    expect(due.due).toBe('2027-03-22')
    expect(due.rolledFrom).toBe('2027-03-21')
    expect(due.countingMethod).toContain('RSA 21:35 I')
    expect(due.countingMethod).toContain('RSA 21:35 II')
    expect(due.startEvent).toBe('order_served')
    expect(due.ruleKey).toBe('nh.enf.answer_zoning')
  })

  it('answer due from a Thursday publication end is 2027-04-14', () => {
    const due = computeSubjectDue(clock('nh.enf.answer_zoning'), d('2027-03-25'), ctx())
    expect(due.due).toBe('2027-04-14')
    expect(due.rolledFrom).toBeNull()
  })

  it('judgment appeal skips the observed Independence Day', () => {
    const due = computeSubjectDue(clock('nh.enf.judgment_appeal_zoning'), d('2027-06-18'), ctx())
    expect(due.due).toBe('2027-07-06')
    expect(due.rolledFrom).toBe('2027-07-03')
  })

  it('consequence text is never empty', () => {
    for (const key of [
      'nh.enf.answer_zoning',
      'nh.enf.answer_building',
      'nh.enf.judgment_appeal_zoning',
      'nh.enf.judgment_appeal_building',
    ]) {
      expect(
        computeSubjectDue(clock(key), d('2027-03-01'), ctx()).consequence.length,
      ).toBeGreaterThan(0)
    }
  })

  it('a rule whose length depends on a setting is PACK_INVALID', () => {
    const bad = { ...clock('town.bp.expiration') }
    expect(() => computeSubjectDue(bad, d('2027-03-01'), ctx())).toThrow(AppError)
  })
})

describe('subjectDueStatus', () => {
  const due = computeSubjectDue(clock('nh.enf.answer_zoning'), d('2027-03-01'), ctx())
  it('running before the due date', () => {
    expect(subjectDueStatus(due, d('2027-03-20'))).toEqual({ status: 'running', daysRemaining: 2 })
  })
  it('due today on the due date', () => {
    expect(subjectDueStatus(due, d('2027-03-22'))).toEqual({
      status: 'due_today',
      daysRemaining: 0,
    })
  })
  it('passed after the due date', () => {
    expect(subjectDueStatus(due, d('2027-03-23'))).toEqual({ status: 'passed', daysRemaining: -1 })
  })
})
