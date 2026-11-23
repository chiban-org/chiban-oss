import { ME_URLS, TOWN_RULE } from '@packs/me/rules/urls'
import type { PackRule } from '@/features/packs/schema'

const SECTION_4103_3 = { label: '30-A MRSA §4103(3)', url: ME_URLS.title30Asec4103 } as const
const SECTION_9724 = { label: '10 MRSA §9724', url: ME_URLS.title10sec9724 } as const

export const BUILDING_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'me.bp.decision',
    version: 1,
    label: 'Building permit decision deadline',
    citation: SECTION_4103_3,
    clockType: 'action_due',
    whose: 'official',
    startEvent: 'application_received',
    length: { unit: 'days', value: 30 },
    direction: 'after',
    consequence: {
      kind: 'deemed_refused',
      text: 'Under 30-A MRSA §4103(3), no written decision to the applicant within 30 days of filing is a refusal of the permit.',
    },
    extension: { allowed: false, note: '30-A MRSA §4103(3) provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'required_record',
    key: 'me.bp.code_edition',
    version: 1,
    label: 'Maine Uniform Building and Energy Code edition record',
    citation: SECTION_9724,
    fields: [
      'receiptDate',
      'completedDate',
      'classification',
      'dwellingUnits',
      'editionKey',
      'applicantElection',
      'localAmendmentsInForce',
    ],
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'gate',
    key: 'me.bp.code_edition_recorded',
    version: 1,
    label: 'Code edition recorded before issuance',
    citation: SECTION_9724,
    gateKind: 'statutory',
    appliesTo: ['issued'],
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'town_setting',
    key: 'town.bp.validity',
    version: 1,
    label: 'Building permit validity period (Chiban starting value)',
    citation: TOWN_RULE,
    unit: 'months',
    overridePolicy: { policy: 'delegated_choice', default: 12 },
  },
  {
    kind: 'clock',
    key: 'town.bp.expiration',
    version: 1,
    label: 'Building permit exercise-by date',
    citation: TOWN_RULE,
    clockType: 'exercise_by',
    whose: 'applicant',
    startEvent: 'permit_issued',
    length: { unit: 'months', fromSetting: 'town.bp.validity' },
    direction: 'after',
    consequence: { kind: 'lapse', text: 'The permit expires unless renewed.' },
    extension: { allowed: true, by: 'town_renewal' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
]
