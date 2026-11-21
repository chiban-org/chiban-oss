import { ME_URLS } from '@packs/me/rules/urls'
import type { LicenseLookup, LicenseTypeGroup } from '@/features/packs/schema'

export const ME_LICENSE_TYPES: readonly LicenseTypeGroup[] = [
  {
    trade: 'electrical',
    label: 'Electrical',
    source: ME_URLS.title32sec1202B,
    licenses: [
      'Apprentice electrician',
      'Helper electrician',
      'Journeyman-in-training electrician',
      'Journeyman electrician',
      'Master electrician',
      'Limited electrician',
    ],
  },
  {
    trade: 'plumbing',
    label: 'Plumbing',
    source: ME_URLS.title32sec3501,
    licenses: [
      'Trainee plumber',
      'Journeyman-in-training plumber',
      'Journeyman plumber',
      'Limited plumber',
      'Master plumber',
    ],
  },
  {
    trade: 'fuelGas',
    label: 'Propane and natural gas',
    source: ME_URLS.title32ch139,
    licenses: ['Propane and natural gas technician', 'Propane and natural gas helper'],
  },
  {
    trade: 'oilHeating',
    label: 'Oil and solid fuel',
    source: ME_URLS.title32ch139,
    licenses: [
      'Master oil burner technician or solid fuel technician',
      'Journeyman oil burner technician or solid fuel technician',
      'Apprentice oil and solid fuel burning technician',
      'Tank installer',
      'Wood pellet technician',
    ],
  },
  {
    trade: 'manufacturedHousing',
    label: 'Manufactured housing',
    source: ME_URLS.title10sec9022,
    licenses: ['Manufactured housing mechanic', 'Manufactured housing installer'],
  },
]

const DEFAULT_BY_TYPE: ReadonlyMap<string, string> = new Map([
  ['IP', 'Master plumber'],
  ['SSW', 'Master plumber'],
])

export function meDefaultLicenseType(applicationTypeKey: string): string | null {
  return DEFAULT_BY_TYPE.get(applicationTypeKey) ?? null
}

export const ME_LICENSE_LOOKUP: LicenseLookup | null = {
  label: 'Maine licensee search',
  url: ME_URLS.licenseeSearch,
}
