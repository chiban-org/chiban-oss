export const LICENSE_TRADES = ['electrical', 'plumbing', 'fuelGas', 'oilHeating'] as const
export type LicenseTrade = (typeof LICENSE_TRADES)[number]

export interface LicenseTypeGroup {
  trade: LicenseTrade
  label: string
  source: string
  licenses: readonly string[]
}

export interface LicenseLookup {
  label: string
  url: string
}
