import { describe, expect, it } from 'vitest'
import { centsToDollarInput, dollarsToCents, formatCents } from '@/lib/money'

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

describe('centsToDollarInput', () => {
  it('writes a plain amount that dollarsToCents reads back', () => {
    expect(centsToDollarInput(123456)).toBe('1234.56')
    expect(centsToDollarInput(4505)).toBe('45.05')
    expect(dollarsToCents(centsToDollarInput(123456))).toBe(123456)
  })
})
