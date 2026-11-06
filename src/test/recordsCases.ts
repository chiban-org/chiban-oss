import { formatCivilDate } from '@/lib/formatDate'
import type { FieldCopy } from '@/test/refusalCopy'
import type { CivilDate } from '@/types/civilDate'

export const between = (noun: string, today: CivilDate) =>
  `Enter ${noun} between January 1, 1900 and ${formatCivilDate(today)}.`

export function dateCopy(noun: string, today: CivilDate): FieldCopy {
  return {
    missing: `Enter ${noun}.`,
    impossible_date: `Enter ${noun} as a date.`,
    words: `Enter ${noun} as a date.`,
    otherwise: between(noun, today),
  }
}

export function textCopy(noun: string, max: number): FieldCopy {
  return {
    missing: `Enter ${noun}.`,
    whitespace: `Enter ${noun}.`,
    otherwise: `Enter ${noun} of ${max} characters or fewer.`,
  }
}

export function wholeNumberCopy(noun: string, min: number, max: number): FieldCopy {
  return {
    missing: `Enter ${noun}.`,
    otherwise: `Enter ${noun} as a whole number from ${min} to ${max}.`,
  }
}

export const MONEY_RANGE = 'from $0.01 to $10,000,000.00'

export function moneyCopy(noun: string): FieldCopy {
  return {
    missing: `Enter ${noun}.`,
    below_min: `Enter ${noun} ${MONEY_RANGE}.`,
    otherwise: `Enter ${noun} in dollars and cents, like 25.00.`,
  }
}
