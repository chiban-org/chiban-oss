import { err, ok } from '@/types/result'
import { blankAsNull, type FieldParse, inputField, trimmed } from './field'

export interface WholeNumberBounds {
  min: number
  max: number
}

const WHOLE_NUMBER = /^-?\d+$/

function wholeNumberParse(noun: string, { min, max }: WholeNumberBounds): FieldParse<number> {
  return (raw) => {
    const value = trimmed(raw)
    if (value === '') return err(`Enter ${noun}.`)
    const n = WHOLE_NUMBER.test(value) ? Number(value) : Number.NaN
    if (!Number.isSafeInteger(n) || n < min || n > max)
      return err(`Enter ${noun} as a whole number from ${min} to ${max}.`)
    return ok(n)
  }
}

export function wholeNumber(noun: string, bounds: WholeNumberBounds) {
  return inputField(wholeNumberParse(noun, bounds))
}

export function optionalWholeNumber(noun: string, bounds: WholeNumberBounds) {
  return inputField(blankAsNull(wholeNumberParse(noun, bounds)))
}

export const MAX_MONEY_CENTS = 1_000_000_000

export interface MoneyBounds {
  min?: number
  max?: number
}

const DIGITS = /^\d+$/
const CENT_DIGITS = /^\d{1,2}$/

function centsOf(value: string): number | null {
  const [whole = '', fraction, ...rest] = value.split('.')
  if (rest.length > 0 || !DIGITS.test(whole)) return null
  if (fraction !== undefined && !CENT_DIGITS.test(fraction)) return null
  return Number(whole) * 100 + Number((fraction ?? '').padEnd(2, '0'))
}

const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function dollars(cents: number): string {
  return DOLLARS.format(cents / 100)
}

function moneyParse(
  noun: string,
  { min = 1, max = MAX_MONEY_CENTS }: MoneyBounds,
): FieldParse<number> {
  return (raw) => {
    const value = trimmed(raw)
    if (value === '') return err(`Enter ${noun}.`)
    const cents = centsOf(value)
    if (cents === null) return err(`Enter ${noun} in dollars and cents, like 25.00.`)
    if (!Number.isSafeInteger(cents) || cents < min || cents > max)
      return err(`Enter ${noun} from ${dollars(min)} to ${dollars(max)}.`)
    return ok(cents)
  }
}

export function moneyCents(noun: string, bounds: MoneyBounds = {}) {
  return inputField(moneyParse(noun, bounds))
}

export function optionalMoneyCents(noun: string, bounds: MoneyBounds = {}) {
  return inputField(blankAsNull(moneyParse(noun, bounds)))
}
