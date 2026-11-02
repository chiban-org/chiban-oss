import { describe, expect, it } from 'vitest'
import { formatCents } from '@/lib/money'

describe('formatCents', () => {
  it('formats dollars and cents with grouping', () => {
    expect(formatCents(45000)).toBe('$450.00')
    expect(formatCents(5)).toBe('$0.05')
    expect(formatCents(123456789)).toBe('$1,234,567.89')
    expect(formatCents(0)).toBe('$0.00')
  })

  it('formats a negative amount', () => {
    expect(formatCents(-250)).toBe('-$2.50')
  })
})
