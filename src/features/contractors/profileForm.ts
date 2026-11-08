import type { LicenseTrade } from '@packs/nh/licenseTypes'
import { z } from 'zod'
import type { ContractorDetails } from '@/features/contractors/profile'
import { TRADE_KEYS } from '@/features/contractors/trades'
import { optionalPhone, optionalText, phone, requiredText } from '@/features/input/schemas'

const NAME_MAX = 120
const ADDRESS_MAX = 300
const LICENSE_MAX = 40

export function licenseFieldName(trade: LicenseTrade): string {
  return `license_${trade}`
}

const tradeList = z.preprocess(
  (raw: unknown): unknown[] => {
    if (raw === undefined) return []
    return Array.isArray(raw) ? (raw as unknown[]) : [raw]
  },
  z.array(z.enum(TRADE_KEYS)),
)

const licenseFields = Object.fromEntries(
  TRADE_KEYS.map((trade) => [
    licenseFieldName(trade),
    optionalText('the license number', { max: LICENSE_MAX }),
  ]),
)

export const PersonForm = z.object({
  name: requiredText('your name', { max: NAME_MAX }),
  phone: optionalPhone('a phone number'),
  mailingAddress: optionalText('a mailing address', { max: ADDRESS_MAX }),
})

const ContractorFields = z.object({
  companyName: requiredText('the company name'),
  name: requiredText('a contact name', { max: NAME_MAX }),
  phone: phone('a phone number'),
  mailingAddress: optionalText('a mailing address', { max: ADDRESS_MAX }),
  trades: tradeList,
  ...licenseFields,
})

function toContractor(parsed: z.output<typeof ContractorFields>): ContractorDetails {
  const numbers = parsed as unknown as Record<string, string | null>
  const licenses = TRADE_KEYS.flatMap((trade) => {
    const number = numbers[licenseFieldName(trade)] ?? null
    return number === null ? [] : [{ trade, number }]
  })
  const trades = TRADE_KEYS.filter(
    (trade) => parsed.trades.includes(trade) || licenses.some((l) => l.trade === trade),
  )
  return {
    companyName: parsed.companyName,
    name: parsed.name,
    phone: parsed.phone,
    mailingAddress: parsed.mailingAddress,
    trades,
    licenses,
  }
}

export const ContractorForm = ContractorFields.transform(toContractor)
