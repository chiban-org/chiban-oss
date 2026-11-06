import type { InvalidVariant } from '@/test/testHarness/actions'

const DATE_RANGE = 'between January 1, 1900 and December 31, 2099.'

export function dateMessage(noun: string, variant: InvalidVariant): string {
  if (variant.kind === 'missing') return `Enter ${noun}.`
  if (variant.kind === 'too_early' || variant.kind === 'too_late')
    return `Enter ${noun} ${DATE_RANGE}`
  return `Enter ${noun} as a date.`
}

export function textMessage(noun: string, max: number, variant: InvalidVariant): string {
  return variant.kind === 'too_long'
    ? `Enter ${noun} of ${max} characters or fewer.`
    : `Enter ${noun}.`
}

export function idMessage(noun: string): string {
  return `Choose ${noun}.`
}
