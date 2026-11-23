import { ME_LICENSE_LOOKUP, ME_LICENSE_TYPES, meDefaultLicenseType } from '@packs/me/licenseTypes'
import { describe, expect, it } from 'vitest'

const allNames = ME_LICENSE_TYPES.flatMap((group) => group.licenses)

describe('ME license types', () => {
  it('groups the licenses by trade with a statute source for each', () => {
    expect(ME_LICENSE_TYPES.map((group) => group.trade)).toEqual([
      'electrical',
      'plumbing',
      'fuelGas',
      'oilHeating',
      'manufacturedHousing',
    ])
    for (const group of ME_LICENSE_TYPES) {
      expect(group.licenses.length).toBeGreaterThan(0)
      expect(group.source.startsWith('https://legislature.maine.gov/statutes/')).toBe(true)
    }
  })

  it('names each license once', () => {
    expect(new Set(allNames).size).toBe(allNames.length)
  })

  it('lists the electrician and plumber classes', () => {
    const byTrade = (trade: string) =>
      ME_LICENSE_TYPES.find((group) => group.trade === trade)?.licenses ?? []
    expect(byTrade('electrical')).toHaveLength(6)
    expect(byTrade('plumbing')).toHaveLength(5)
    expect(byTrade('fuelGas')).toContain('Propane and natural gas technician')
    expect(byTrade('oilHeating')).toContain('Wood pellet technician')
    expect(byTrade('manufacturedHousing')).toEqual([
      'Manufactured housing mechanic',
      'Manufactured housing installer',
    ])
  })

  it('defaults the plumbing application types to a plumber', () => {
    expect(meDefaultLicenseType('IP')).toBe('Master plumber')
    expect(meDefaultLicenseType('SSW')).toBe('Master plumber')
    expect(allNames).toContain('Master plumber')
  })

  it('has no default for other types', () => {
    expect(meDefaultLicenseType('BP')).toBeNull()
  })

  it('looks licensees up on the PFR licensee search', () => {
    expect(ME_LICENSE_LOOKUP).toEqual({
      label: 'Maine licensee search',
      url: 'https://www.maine.gov/pfr/consumer/licensee-search',
    })
  })
})
