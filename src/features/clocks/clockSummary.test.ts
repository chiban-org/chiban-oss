import { describe, expect, it } from 'vitest'
import { dueNext, isLate, overdueCount, sortClocks } from './clockSummary'

type Status = 'running' | 'overdue' | 'met' | 'stopped' | 'lapsed' | 'superseded'

function clock(ruleLabel: string, status: Status, daysRemaining: number) {
  return { ruleLabel, status, daysRemaining, currentDue: { value: '2026-12-01' } }
}

describe('clock summary', () => {
  it('sorts overdue first, then running by nearest due, then met, stopped and lapsed', () => {
    const sorted = sortClocks([
      clock('met', 'met', 0),
      clock('lapsed', 'lapsed', 0),
      clock('far', 'running', 40),
      clock('stopped', 'stopped', 0),
      clock('late', 'overdue', -5),
      clock('near', 'running', 3),
    ])
    expect(sorted.map((c) => c.ruleLabel)).toEqual([
      'late',
      'near',
      'far',
      'met',
      'stopped',
      'lapsed',
    ])
  })

  it('treats a running clock past its due date as late', () => {
    expect(isLate(clock('a', 'running', -1))).toBe(true)
    expect(isLate(clock('a', 'running', 0))).toBe(false)
    expect(isLate(clock('a', 'overdue', -3))).toBe(true)
    expect(isLate(clock('a', 'met', -3))).toBe(false)
  })

  it('counts late clocks and picks the nearest open one as due next', () => {
    const clocks = [
      clock('met', 'met', -100),
      clock('far', 'running', 40),
      clock('late', 'overdue', -213),
      clock('near', 'running', 3),
    ]
    expect(overdueCount(clocks)).toBe(1)
    expect(dueNext(clocks)?.ruleLabel).toBe('late')
    expect(dueNext([clock('far', 'running', 40), clock('near', 'running', 3)])?.ruleLabel).toBe(
      'near',
    )
    expect(dueNext([clock('met', 'met', 0)])).toBeNull()
  })
})
