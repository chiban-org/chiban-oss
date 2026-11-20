import {
  BOARD_KINDS,
  type BoardKind,
  type BoardKindNames,
  type StatePack,
} from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { XX_PACK_MANIFEST } from './manifest'

const BOARD_KIND_NAMES = Object.fromEntries(
  BOARD_KINDS.map((kind) => [
    kind,
    {
      label: `Vellmora ${kind} body`,
      defaultShortName: `${kind} body`,
      shortLabel: `${kind} board`,
      abbreviation: `${kind} abbr`,
      description: 'Fictional.',
    },
  ]),
) as Record<BoardKind, BoardKindNames>

export const XX_PACK: StatePack = {
  manifest: XX_PACK_MANIFEST,
  docsSlug: 'xx',
  boardKinds: BOARD_KIND_NAMES,
  classificationKeys: XX_PACK_MANIFEST.classifications.map((c) => c.key),
  starters: [],
  buildingCodes: {
    choices: [
      { key: 'xx.code.a', label: 'Vellmora Code A' },
      { key: 'xx.code.b', label: 'Vellmora Code B' },
    ],
    defaultChoice: 'xx.code.a',
    requiredAbove: { residents: 4000, choice: 'xx.code.b' },
  },
  inspectionSettingsDefault: {
    key: 'default',
    schedulingDays: [2, 4],
    windowStartMinute: 540,
    windowEndMinute: 900,
    slotMinutes: 30,
    minNoticeDays: 2,
    horizonDays: 14,
    maxPerInspectorPerDay: 4,
    phoneRequestHours: { days: [2, 4], startMinute: 540, endMinute: 660 },
    portalRequestsEnabled: false,
  },
  holidays: (year) => [
    {
      date: `${String(year)}-03-03` as CivilDate,
      name: 'Founding Day',
      citation: 'Vellmora Calendar Act 1',
    },
  ],
  countingCitations: {
    dayCounting: 'Vellmora Calendar Act 2',
    businessDayRoll: 'Vellmora Calendar Act 3',
  },
  licenseTypes: [],
  defaultLicenseType: () => null,
  licenseLookup: null,
  rtkExemptions: [
    {
      key: 'xx.rtk.personal',
      paragraph: '1',
      label: 'Personal records',
      citation: {
        label: 'Vellmora Records Act 5',
        url: 'https://laws.example/vellmora/records-act',
      },
    },
  ],
  appealRoutes: [],
  parcelIdFormats: [
    {
      key: 'lot8',
      label: 'Lot number',
      kind: 'digits',
      width: 8,
      isDisplay: true,
      example: '00000001',
    },
  ],
  stateCodeSections: [],
  ruleTransitions: [],
  ruleAreas: [{ title: 'All rules', rules: XX_PACK_MANIFEST.rules }],
  orderTexts: {
    motionNotice: 'Vellmora motion notice.',
    lienWarning: 'Vellmora lien warning.',
    ceaseSentence: 'Stop now.',
    noticeOfViolationIntro: 'Vellmora notice of violation.',
    noticeOfViolationRequest: 'Please call the town.',
  },
  spatial: { projectedSrid: 3437, label: 'NAD83 / New Hampshire (ftUS)' },
  labels: {
    environmentalAgency: 'Vellmora Water Office',
    environmentalAgencyShort: 'the Water Office',
    stateLicenseNumber: 'Vellmora license number',
    recordsLaw: 'Open Records',
    recordsRequest: 'Open Records request',
    governingBody: 'town council',
    citations: {
      exerciseFloorAuthority: 'Vellmora Land Act 12',
      abutterListIssued: { label: 'Vellmora Land Act 9', url: null },
    },
  },
}
