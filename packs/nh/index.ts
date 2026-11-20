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
import type { StatePack } from '@/features/packs/schema'

export const NH_PACK: StatePack = {
  manifest: NH_PACK_MANIFEST,
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
  labels: {
    environmentalAgency: 'NH Department of Environmental Services',
    environmentalAgencyShort: 'NH DES',
    stateLicenseNumber: 'NH license number',
  },
}
