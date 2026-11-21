import { ME_BOARD_KINDS } from '@packs/me/boardSchema'
import { ME_STATE_CODE_SECTIONS } from '@packs/me/buildingCodeSections'
import { ME_CLASSIFICATIONS } from '@packs/me/classifications'
import { ME_COUNTING_CITATIONS } from '@packs/me/countingCitations'
import { meLegalHolidays } from '@packs/me/holidays'
import { ME_LICENSE_LOOKUP, ME_LICENSE_TYPES, meDefaultLicenseType } from '@packs/me/licenseTypes'
import { ME_PACK_MANIFEST } from '@packs/me/manifest'
import { ME_PARCEL_ID_FORMATS } from '@packs/me/parcelIdFormats'
import { ME_FOAA_EXEMPTIONS } from '@packs/me/rtkExemptions'
import { ME_RULE_AREAS } from '@packs/me/ruleAreas'
import { ME_URLS } from '@packs/me/rules/urls'
import { ME_INSPECTION_SETTINGS_DEFAULT, ME_STARTERS } from '@packs/me/starters'
import { ME_ORDER_TEXTS } from '@packs/me/starters/enforcementTemplates'
import { ME_RULE_TRANSITIONS } from '@packs/me/transitions'
import type { StatePack } from '@/features/packs/schema'

const SIGNIFICANT_DECISION_HELP =
  'Under 30-A MRSA §4481(1), a significant land use decision is final action on a project reviewed under a site plan or other chapter 187, subchapter 3 ordinance, or under Title 38, section 488, subsection 19 or section 489-A, whose buildings occupy more than 10,000 square feet of ground area or contain more than 40,000 square feet of floor area, or that occupies more than 3 acres with buildings, parking lots, roads, paved areas, wharves and other areas stripped or graded and not revegetated. It is also final action on a project of 10 or more lots under a chapter 187, subchapter 4 (subdivision) ordinance or that Title 38 authority.'

export const ME_PACK: StatePack = {
  manifest: ME_PACK_MANIFEST,
  docsSlug: 'maine',
  boardKinds: ME_BOARD_KINDS,
  classificationKeys: ME_CLASSIFICATIONS.map((c) => c.key),
  starters: ME_STARTERS,
  inspectionSettingsDefault: ME_INSPECTION_SETTINGS_DEFAULT,
  buildingCodes: {
    choices: [
      { key: 'me.code.mubc', label: 'Maine Uniform Building Code' },
      { key: 'me.code.muec', label: 'Maine Uniform Energy Code' },
      { key: 'me.code.mubec', label: 'Maine Uniform Building and Energy Code' },
    ],
    defaultChoice: null,
    requiredAbove: { residents: 4000, choice: 'me.code.mubec' },
  },
  holidays: (year) => meLegalHolidays(year),
  countingCitations: ME_COUNTING_CITATIONS,
  licenseTypes: ME_LICENSE_TYPES,
  defaultLicenseType: meDefaultLicenseType,
  licenseLookup: ME_LICENSE_LOOKUP,
  rtkExemptions: ME_FOAA_EXEMPTIONS,
  appealRoutes: [],
  parcelIdFormats: ME_PARCEL_ID_FORMATS,
  stateCodeSections: ME_STATE_CODE_SECTIONS,
  ruleTransitions: ME_RULE_TRANSITIONS,
  ruleAreas: ME_RULE_AREAS,
  orderTexts: ME_ORDER_TEXTS,
  spatial: { projectedSrid: 26847, label: 'NAD83 / Maine East (ftUS)' },
  recordsRequests: { acknowledgement: true },
  labels: {
    environmentalAgency: 'Maine Department of Environmental Protection',
    environmentalAgencyShort: 'Maine DEP',
    stateLicenseNumber: 'Maine license number',
    recordsLaw: 'FOAA',
    recordsRequest: 'FOAA request',
    governingBody: 'municipal officers',
    rehearing: { noun: 'reconsideration', capitalised: 'Reconsideration' },
    significantDecisionHelp: SIGNIFICANT_DECISION_HELP,
    citations: {
      exerciseFloorAuthority: 'town ordinance',
      abutterListIssued: { label: '30-A MRSA §4403(3)(A)', url: ME_URLS.title30Asec4403 },
    },
  },
}
