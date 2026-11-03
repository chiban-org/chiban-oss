import { describe, expect, it } from 'vitest'
import { caseChipStatus } from './chipStatus'

describe('caseChipStatus', () => {
  it('marks a found violation as failed and a resolved case as passed', () => {
    expect(caseChipStatus('violation_found')).toBe('failed')
    expect(caseChipStatus('resolved')).toBe('passed')
  })

  it('marks open legal steps as needing attention', () => {
    expect(caseChipStatus('order_issued')).toBe('overdue')
    expect(caseChipStatus('in_court')).toBe('overdue')
  })

  it('keeps intake and closed cases neutral', () => {
    expect(caseChipStatus('intake')).toBe('neutral')
    expect(caseChipStatus('closed')).toBe('neutral')
  })
})
