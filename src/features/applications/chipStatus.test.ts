import { describe, expect, it } from 'vitest'
import { applicationChipStatus } from './chipStatus'

describe('applicationChipStatus', () => {
  it('maps outcome states to their status colors and everything else to neutral', () => {
    expect(applicationChipStatus('issued')).toBe('passed')
    expect(applicationChipStatus('suspended')).toBe('overdue')
    expect(applicationChipStatus('denied')).toBe('failed')
    expect(applicationChipStatus('expired')).toBe('failed')
    expect(applicationChipStatus('under_review')).toBe('neutral')
  })
})
