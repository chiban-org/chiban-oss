import { ELECTRICAL_STARTER } from '@packs/nh/starters/electrical'
import { MECHANICAL_GAS_STARTER } from '@packs/nh/starters/mechanicalGas'
import { PLUMBING_STARTER } from '@packs/nh/starters/plumbing'

export type LicenseTrade = 'electrical' | 'plumbing' | 'fuelGas' | 'oilHeating'

export interface LicenseTypeGroup {
  trade: LicenseTrade
  label: string
  source: string
  licenses: readonly string[]
}

export const NH_LICENSE_TYPES: readonly LicenseTypeGroup[] = [
  {
    trade: 'electrical',
    label: 'Electrical',
    source: 'https://gc.nh.gov/rsa/html/XXX/319-C/319-C-mrg.htm',
    licenses: [
      'Master electrician',
      'Journeyman electrician',
      'High/medium voltage electrician',
      'Apprentice electrician (registration)',
    ],
  },
  {
    trade: 'plumbing',
    label: 'Plumbing',
    source: 'https://gc.nh.gov/rules/state_agencies/mec300.html',
    licenses: ['Master plumber', 'Journeyman plumber', 'Plumbing apprentice'],
  },
  {
    trade: 'fuelGas',
    label: 'Fuel gas fitting',
    source: 'https://gc.nh.gov/rules/state_agencies/mec300.html',
    licenses: [
      'Fuel gas service technician',
      'Fuel gas installation technician',
      'Fuel gas piping installer',
      'Hearth system installation and service technician',
      'Domestic appliance technician',
      'Fuel gas trainee',
    ],
  },
  {
    trade: 'oilHeating',
    label: 'Oil heating',
    source: 'https://gc.nh.gov/rules/state_agencies/mec700.html',
    licenses: [
      'Heating installer (voluntary certification)',
      'Heating equipment service personnel (voluntary certification)',
    ],
  },
]

const DEFAULT_BY_TYPE: ReadonlyMap<string, string> = new Map([
  [ELECTRICAL_STARTER.applicationType.key, 'Master electrician'],
  [PLUMBING_STARTER.applicationType.key, 'Master plumber'],
  [MECHANICAL_GAS_STARTER.applicationType.key, 'Fuel gas service technician'],
])

export function nhDefaultLicenseType(applicationTypeKey: string): string | null {
  return DEFAULT_BY_TYPE.get(applicationTypeKey) ?? null
}
