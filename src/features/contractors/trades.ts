import { activePack } from '@/features/packs/registry'
import { LICENSE_TRADES, type LicenseTrade } from '@/features/packs/schema/licenses'

export interface TradeChoice {
  trade: LicenseTrade
  label: string
}

export const TRADE_KEYS = LICENSE_TRADES

export function contractorTrades(): TradeChoice[] {
  return activePack().licenseTypes.map((group) => ({ trade: group.trade, label: group.label }))
}

export function tradeLabel(trade: string): string {
  return contractorTrades().find((t) => t.trade === trade)?.label ?? trade
}

export function tradeForLicenseType(licenseType: string | null): LicenseTrade | null {
  if (licenseType === null) return null
  return (
    activePack().licenseTypes.find((group) => group.licenses.includes(licenseType))?.trade ?? null
  )
}
