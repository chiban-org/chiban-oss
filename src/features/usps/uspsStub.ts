import type { UspsQuery } from '@/features/usps/addressQuery'
import type { LookupOutcome, UspsLookup } from '@/features/usps/uspsClient'
import { err, ok } from '@/types/result'

const SHORT_WORDS = new Map([
  ['STREET', 'ST'],
  ['ROAD', 'RD'],
  ['LANE', 'LN'],
  ['AVENUE', 'AVE'],
  ['DRIVE', 'DR'],
  ['COURT', 'CT'],
  ['PLACE', 'PL'],
  ['APARTMENT', 'APT'],
  ['SUITE', 'STE'],
])

function shout(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(' ')
    .filter((word) => word !== '')
    .map((word) => SHORT_WORDS.get(word) ?? word)
    .join(' ')
}

function plus4For(street: string): string {
  const number = Number.parseInt(street, 10)
  return String(Number.isNaN(number) ? 1 : number % 10_000).padStart(4, '0')
}

function waitForAbort(signal: AbortSignal): Promise<LookupOutcome> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve(err('unreachable'))
    signal.addEventListener('abort', () => resolve(err('unreachable')), { once: true })
  })
}

function standardize(query: UspsQuery, signal: AbortSignal): Promise<LookupOutcome> {
  const street = shout(query.streetAddress)
  if (street.includes('SLOW')) return waitForAbort(signal)
  if (street.includes('NOWHERE')) return Promise.resolve(ok(null))
  const unit = query.secondaryAddress === undefined ? '' : shout(query.secondaryAddress)
  return Promise.resolve(
    ok({
      streetAddress: unit === '' ? street : `${street} ${unit}`,
      secondaryAddress: '',
      city: shout(query.city ?? 'Alder Pond'),
      state: query.state ?? 'NH',
      ZIPCode: query.ZIPCode ?? '03000',
      ZIPPlus4: plus4For(street),
    }),
  )
}

export const uspsStub: UspsLookup = { standardize }
