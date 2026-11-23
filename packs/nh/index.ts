import { NH_APPEAL_ROUTES } from '@packs/nh/appealRoutes'
import { CLASSIFICATION_KEYS, NH_BOARD_KINDS } from '@packs/nh/boardSchema'
import { NH_STATE_CODE_SECTIONS } from '@packs/nh/buildingCodeSections'
import { NH_COUNTING_CITATIONS } from '@packs/nh/countingCitations'
import { nhLegalHolidays } from '@packs/nh/holidays'
import { NH_LICENSE_LOOKUP, NH_LICENSE_TYPES, nhDefaultLicenseType } from '@packs/nh/licenseTypes'
import { NH_PACK_MANIFEST } from '@packs/nh/manifest'
import { NH_PARCEL_ID_FORMATS } from '@packs/nh/parcelIdFormats'
import { NH_RTK_EXEMPTIONS } from '@packs/nh/rtkExemptions'
import { NH_RULE_AREAS } from '@packs/nh/ruleAreas'
import { NH_INSPECTION_SETTINGS_DEFAULT, NH_STARTERS } from '@packs/nh/starters'
import { NH_ORDER_TEXTS } from '@packs/nh/starters/enforcementTemplates'
import { NH_RULE_TRANSITIONS } from '@packs/nh/transitions'
import type { PackCommonJob, StatePack } from '@/features/packs/schema'

const NH_COMMON_JOBS: readonly PackCommonJob[] = [
  {
    key: 'BP',
    title: 'Build, add on or tear down',
    description: 'A new building, an addition, a deck, garage, shed or fence, or a demolition.',
  },
  {
    key: 'EL',
    title: 'Electrical work',
    description: 'Wiring, a new service or panel, or a generator.',
  },
  {
    key: 'PL',
    title: 'Plumbing',
    description: 'New or moved fixtures, a water heater, or water and drain piping.',
  },
  {
    key: 'MG',
    title: 'Gas or heating equipment',
    description: 'Gas piping, a furnace or boiler, or other fuel-burning equipment.',
  },
  {
    key: 'DW',
    title: 'Driveway',
    description: 'A new driveway, or a change where one meets the road.',
  },
  { key: 'SG', title: 'Sign', description: 'A new sign, or a change to an existing one.' },
]

export const NH_PACK: StatePack = {
  manifest: NH_PACK_MANIFEST,
  docsSlug: 'new-hampshire',
  boardKinds: NH_BOARD_KINDS,
  classificationKeys: CLASSIFICATION_KEYS,
  starters: NH_STARTERS,
  inspectionSettingsDefault: NH_INSPECTION_SETTINGS_DEFAULT,
  buildingCodes: {
    choices: [{ key: 'state_code', label: 'State building code' }],
    defaultChoice: 'state_code',
    requiredAbove: null,
  },
  holidays: (year) => nhLegalHolidays(year),
  countingCitations: NH_COUNTING_CITATIONS,
  licenseTypes: NH_LICENSE_TYPES,
  defaultLicenseType: nhDefaultLicenseType,
  licenseLookup: NH_LICENSE_LOOKUP,
  rtkExemptions: NH_RTK_EXEMPTIONS,
  appealRoutes: NH_APPEAL_ROUTES,
  parcelIdFormats: NH_PARCEL_ID_FORMATS,
  stateCodeSections: NH_STATE_CODE_SECTIONS,
  ruleTransitions: NH_RULE_TRANSITIONS,
  ruleAreas: NH_RULE_AREAS,
  orderTexts: NH_ORDER_TEXTS,
  spatial: { projectedSrid: 3437, label: 'NAD83 / New Hampshire (ftUS)' },
  recordsRequests: { acknowledgement: false },
  portal: {
    commonJobs: NH_COMMON_JOBS,
    officeClassifications: ['nh.building_permit', 'nh.trade_permit'],
  },
  labels: {
    environmentalAgency: 'NH Department of Environmental Services',
    environmentalAgencyShort: 'NH DES',
    stateLicenseNumber: 'NH license number',
    recordsLaw: 'Right-to-Know',
    recordsRequest: 'Right-to-Know request',
    governingBody: 'selectmen',
    rehearing: { noun: 'rehearing', capitalised: 'Rehearing' },
    significantDecisionQuestion: null,
    significantDecisionHelp: null,
    administrativeOfficials: ['building inspector', 'zoning administrator'],
    recordsRequestPrefix: 'RK',
    timeStatementDateLabel: 'Response by',
    citations: {
      exerciseFloorAuthority: 'RSA 674:33 I-a(a) and IV(b)',
      abutterListIssued: {
        label: 'RSA 676:4 I(d) and RSA 676:7 I',
        url: 'https://gc.nh.gov/rsa/html/LXIV/676/676-4.htm',
      },
    },
  },
}
