import { afterAll, beforeAll, vi } from 'vitest'
import { MAX_MONEY_CENTS } from '@/features/input/schemas'
import { formatCivilDate } from '@/lib/formatDate'
import type { InvalidVariant } from '@/test/testHarness/actions'
import type { CivilDate } from '@/types/civilDate'

export const ENFORCEMENT_NOW = new Date('2027-07-20T16:00:00Z')
export const ENFORCEMENT_TODAY = '2027-07-20' as CivilDate
export const PAST_ONLY = { earliest: '1900-01-01', latest: ENFORCEMENT_TODAY }
export const FULL_RANGE = { earliest: '1900-01-01', latest: '2099-12-31' }

export function useEnforcementClock(): void {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: ENFORCEMENT_NOW })
  })
  afterAll(() => {
    vi.useRealTimers()
  })
}

export function pastDateMessage(noun: string, variant: InvalidVariant): string {
  if (variant.kind === 'missing') return `Enter ${noun}.`
  if (variant.kind === 'too_early' || variant.kind === 'too_late')
    return `Enter ${noun} between January 1, 1900 and ${formatCivilDate(ENFORCEMENT_TODAY)}.`
  return `Enter ${noun} as a date.`
}

export function wholeNumberMessage(
  noun: string,
  range: { min: number; max: number },
  variant: InvalidVariant,
): string {
  return variant.kind === 'missing'
    ? `Enter ${noun}.`
    : `Enter ${noun} as a whole number from ${range.min} to ${range.max}.`
}

const DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function moneyMessage(noun: string, variant: InvalidVariant): string {
  if (variant.kind === 'missing') return `Enter ${noun}.`
  if (variant.kind === 'below_min')
    return `Enter ${noun} from ${DOLLARS.format(0.01)} to ${DOLLARS.format(MAX_MONEY_CENTS / 100)}.`
  return `Enter ${noun} in dollars and cents, like 25.00.`
}
