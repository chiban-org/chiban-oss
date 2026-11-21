import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'
import type { RuleTransition } from '@/features/packs/ruleTransitions'
import type { CivilDate } from '@/types/civilDate'
import type { AppealRoute } from './appeals'
import type { BoardKind } from './boards'
import type { StateCodeSection } from './codeSections'
import type { LicenseLookup, LicenseTypeGroup } from './licenses'
import type { PackManifest, PackRule } from './manifest'
import type { RtkExemption } from './rtk'
import type { StarterBundle } from './starterBundle'

export interface PackHoliday {
  date: CivilDate
  name: string
  citation: string
}

export interface CountingCitations {
  dayCounting: string
  businessDayRoll: string
}

interface PackParcelIdFormatBase {
  key: string
  label: string
  isDisplay: boolean
  example: string
}

export type PackParcelIdFormat =
  | (PackParcelIdFormatBase & { kind: 'digits'; width: number })
  | (PackParcelIdFormatBase & { kind: 'free_text'; width: null })

export interface BoardKindNames {
  label: string
  defaultShortName: string
  shortLabel: string
  abbreviation: string
  description: string
}

export interface OrderTexts {
  motionNotice: string
  lienWarning: string
  ceaseSentence: string
  noticeOfViolationIntro: string
  noticeOfViolationRequest: string
}

export interface PackCitations {
  exerciseFloorAuthority: string
  abutterListIssued: { label: string; url: string | null }
}

export interface PackLabels {
  environmentalAgency: string
  environmentalAgencyShort: string
  stateLicenseNumber: string
  recordsLaw: string
  recordsRequest: string
  governingBody: string
  rehearing: { noun: string; capitalised: string }
  significantDecisionHelp: string | null
  citations: PackCitations
}

export interface PackRecordsRequests {
  acknowledgement: boolean
}

export interface PackSpatial {
  projectedSrid: number
  label: string
}

export interface RuleArea {
  title: string
  rules: readonly PackRule[]
}

export interface StatePack {
  manifest: PackManifest
  docsSlug: string
  boardKinds: Readonly<Record<BoardKind, BoardKindNames>>
  classificationKeys: readonly string[]
  starters: readonly StarterBundle[]
  inspectionSettingsDefault: InspectionSettingsBody
  buildingCodes: {
    choices: readonly { key: string; label: string }[]
    defaultChoice: string | null
    requiredAbove: { residents: number; choice: string } | null
  }
  holidays(year: number): PackHoliday[]
  countingCitations: CountingCitations
  licenseTypes: readonly LicenseTypeGroup[]
  defaultLicenseType(applicationTypeKey: string): string | null
  licenseLookup: LicenseLookup | null
  rtkExemptions: readonly RtkExemption[]
  appealRoutes: readonly AppealRoute[]
  parcelIdFormats: readonly PackParcelIdFormat[]
  stateCodeSections: readonly StateCodeSection[]
  ruleTransitions: readonly RuleTransition[]
  ruleAreas: readonly RuleArea[]
  orderTexts: OrderTexts
  labels: PackLabels
  recordsRequests: PackRecordsRequests
  spatial: PackSpatial
}
