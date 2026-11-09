import type { ParcelSearchHit } from '@/features/parcels/searchParcels'

const NUMBERED = /^(\d+)\s*([A-Za-z]?)\s+(.+)$/
const COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

interface AddressKey {
  street: string
  number: number
  suffix: string
}

function keyOf(address: string | null): AddressKey {
  const text = (address ?? '').trim()
  const match = NUMBERED.exec(text)
  if (match === null) return { street: text, number: Number.POSITIVE_INFINITY, suffix: '' }
  return { street: match[3] ?? '', number: Number(match[1]), suffix: match[2] ?? '' }
}

function compareAddresses(a: ParcelSearchHit, b: ParcelSearchHit): number {
  const left = keyOf(a.siteAddress)
  const right = keyOf(b.siteAddress)
  return (
    COLLATOR.compare(left.street, right.street) ||
    left.number - right.number ||
    COLLATOR.compare(left.suffix, right.suffix)
  )
}

function isIdMatch(hit: ParcelSearchHit): boolean {
  return hit.matchedOn === 'alias_exact' || hit.matchedOn === 'alias_prefix'
}

export function byHouseNumber(hits: readonly ParcelSearchHit[]): ParcelSearchHit[] {
  return [
    ...hits.filter(isIdMatch),
    ...hits.filter((h) => h.matchedOn === 'address').sort(compareAddresses),
    ...hits.filter((h) => h.matchedOn === 'owner'),
  ]
}
