import { z } from 'zod'
import type { AddressSuggestion } from '@/features/address/suggestionLayout'
import type { TypedAddress, UspsQuery } from '@/features/usps/addressQuery'

const StandardAddressSchema = z.object({
  streetAddress: z.string().min(1),
  secondaryAddress: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  ZIPCode: z.string().regex(/^\d{5}$/),
  ZIPPlus4: z.string().nullable().optional(),
})

const AddressResponseSchema = z.object({ address: StandardAddressSchema })

export type StandardAddress = z.infer<typeof StandardAddressSchema>

export function readAddressResponse(body: unknown): StandardAddress | null {
  const parsed = AddressResponseSchema.safeParse(body)
  return parsed.success ? parsed.data.address : null
}

function streetLine(address: StandardAddress): string {
  const unit = address.secondaryAddress?.trim() ?? ''
  if (unit === '' || address.streetAddress.endsWith(unit)) return address.streetAddress
  return `${address.streetAddress} ${unit}`
}

function lastLine(address: StandardAddress): string {
  const plus4 = address.ZIPPlus4 ?? ''
  const zip = plus4 === '' ? address.ZIPCode : `${address.ZIPCode}-${plus4}`
  return `${address.city} ${address.state} ${zip}`
}

function comparable(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function typedText(query: UspsQuery): string {
  const zip = query.ZIPPlus4 === undefined ? query.ZIPCode : `${query.ZIPCode}-${query.ZIPPlus4}`
  return [query.streetAddress, query.secondaryAddress, query.city, query.state, zip]
    .filter((part): part is string => part !== undefined)
    .join(' ')
}

export function buildSuggestion(typed: TypedAddress, address: StandardAddress): AddressSuggestion {
  const standard = [streetLine(address), lastLine(address)]
  return {
    lines: [...typed.preamble, ...standard],
    matches: comparable(typedText(typed.query)) === comparable(standard.join(' ')),
  }
}
