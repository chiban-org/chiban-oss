import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import {
  moneyCents,
  optionalMoneyCents,
  optionalWholeNumber,
  wholeNumber,
} from '@/features/input/schemas'

function verdict(schema: z.ZodType, raw: unknown) {
  const parsed = schema.safeParse(raw)
  return parsed.success ? { value: parsed.data } : { message: parsed.error.issues[0]?.message }
}

describe('wholeNumber', () => {
  const days = wholeNumber('the number of days', { min: 1, max: 365 })
  const message = 'Enter the number of days as a whole number from 1 to 365.'

  it('accepts whole numbers inside the bounds', () => {
    expect(verdict(days, ' 1 ')).toEqual({ value: 1 })
    expect(verdict(days, '365')).toEqual({ value: 365 })
  })

  it('refuses -5, 0, 999999, fractions, words and exponents', () => {
    for (const raw of ['-5', '0', '366', '999999', '1.5', 'thirty', '1e2', '0x10'])
      expect(verdict(days, raw)).toEqual({ message })
  })

  it('refuses a missing value as a missing value', () => {
    expect(verdict(days, ' ')).toEqual({ message: 'Enter the number of days.' })
  })

  it('has an optional form that turns blank into null', () => {
    const optional = optionalWholeNumber('the number of days', { min: 1, max: 365 })
    expect(verdict(optional, '')).toEqual({ value: null })
    expect(verdict(optional, '0')).toEqual({ message })
  })
})

describe('moneyCents', () => {
  const amount = moneyCents('the amount')

  it('turns dollars and cents into whole cents without float drift', () => {
    expect(verdict(amount, '0.29')).toEqual({ value: 29 })
    expect(verdict(amount, ' 1250.5 ')).toEqual({ value: 125050 })
    expect(verdict(amount, '75')).toEqual({ value: 7500 })
  })

  it('refuses -5, abc, 1.005 and a trailing dot as not money', () => {
    for (const raw of ['-5', 'abc', '1.005', '1.', '$5'])
      expect(verdict(amount, raw)).toEqual({
        message: 'Enter the amount in dollars and cents, like 25.00.',
      })
  })

  it('refuses zero by default and over ten million dollars, naming the range', () => {
    const range = 'Enter the amount from $0.01 to $10,000,000.00.'
    expect(verdict(amount, '0')).toEqual({ message: range })
    expect(verdict(amount, '10000000.01')).toEqual({ message: range })
    expect(verdict(amount, '10000000.00')).toEqual({ value: 1_000_000_000 })
  })

  it('takes a per-field minimum such as zero for a fee set to nothing', () => {
    expect(verdict(moneyCents('the fee', { min: 0 }), '0')).toEqual({ value: 0 })
  })

  it('has an optional form that turns blank into null', () => {
    expect(verdict(optionalMoneyCents('the amount'), '')).toEqual({ value: null })
  })
})
