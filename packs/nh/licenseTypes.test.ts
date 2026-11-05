import { NH_LICENSE_TYPES, nhDefaultLicenseType } from '@packs/nh/licenseTypes'
import { ELECTRICAL_STARTER } from '@packs/nh/starters/electrical'
import { MECHANICAL_GAS_STARTER } from '@packs/nh/starters/mechanicalGas'
import { PLUMBING_STARTER } from '@packs/nh/starters/plumbing'
import { describe, expect, it } from 'vitest'

const allNames = NH_LICENSE_TYPES.flatMap((group) => group.licenses)
const OFFICIAL_RULES_SITE = 'https://gc.nh.gov/'

describe('NH license types', () => {
  it('groups the licenses by trade with an official source for each trade', () => {
    expect(NH_LICENSE_TYPES.map((group) => group.trade)).toEqual([
      'electrical',
      'plumbing',
      'fuelGas',
      'oilHeating',
    ])
    for (const group of NH_LICENSE_TYPES) {
      expect(group.licenses.length).toBeGreaterThan(0)
      expect(group.source.startsWith(OFFICIAL_RULES_SITE)).toBe(true)
    }
  })

  it('names each license once', () => {
    expect(new Set(allNames).size).toBe(allNames.length)
  })

  it('defaults each trade permit to a license of its own trade', () => {
    expect(nhDefaultLicenseType(ELECTRICAL_STARTER.applicationType.key)).toBe('Master electrician')
    expect(nhDefaultLicenseType(PLUMBING_STARTER.applicationType.key)).toBe('Master plumber')
    expect(nhDefaultLicenseType(MECHANICAL_GAS_STARTER.applicationType.key)).toBe(
      'Fuel gas service technician',
    )
  })

  it('has no default for permit types no state license covers', () => {
    expect(nhDefaultLicenseType('AR')).toBeNull()
    expect(nhDefaultLicenseType('SC')).toBeNull()
  })
})
