import { describe, expect, it } from 'vitest'
import { CONTRACTOR_TRADES, tradeForLicenseType, tradeLabel } from '@/features/contractors/trades'

describe('contractor trades', () => {
  it('offers the four NH license trades', () => {
    expect(CONTRACTOR_TRADES.map((t) => t.label)).toEqual([
      'Electrical',
      'Plumbing',
      'Fuel gas fitting',
      'Oil heating',
    ])
  })

  it('maps a license type back to its trade and leaves unknown types alone', () => {
    expect(tradeForLicenseType('Master plumber')).toBe('plumbing')
    expect(tradeForLicenseType('Fuel gas service technician')).toBe('fuelGas')
    expect(tradeForLicenseType('Something else')).toBeNull()
    expect(tradeForLicenseType(null)).toBeNull()
  })

  it('labels a stored trade and falls back to the raw key', () => {
    expect(tradeLabel('electrical')).toBe('Electrical')
    expect(tradeLabel('roofing')).toBe('roofing')
  })
})
