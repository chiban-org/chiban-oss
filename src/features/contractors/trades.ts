import { type LicenseTrade, NH_LICENSE_TYPES } from '@packs/nh/licenseTypes'

export const CONTRACTOR_TRADES: readonly { trade: LicenseTrade; label: string }[] =
  NH_LICENSE_TYPES.map((group) => ({ trade: group.trade, label: group.label }))

export const TRADE_KEYS = CONTRACTOR_TRADES.map((t) => t.trade) as [LicenseTrade, ...LicenseTrade[]]

export function tradeLabel(trade: string): string {
  return CONTRACTOR_TRADES.find((t) => t.trade === trade)?.label ?? trade
}

export function tradeForLicenseType(licenseType: string | null): LicenseTrade | null {
  if (licenseType === null) return null
  return NH_LICENSE_TYPES.find((group) => group.licenses.includes(licenseType))?.trade ?? null
}
