import type { PackManifest, PackRoles, PackRule, StatePack } from '@/features/packs/schema'
import { XX_PACK } from './index'

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> }

export interface PackPatch {
  roles?: DeepPartial<PackRoles>
  manifest?: Partial<PackManifest>
  pack?: Partial<StatePack>
}

export function xxPackWith(patch: PackPatch): StatePack {
  const base = XX_PACK.manifest
  const roles: PackRoles = {
    classifications: { ...base.roles.classifications, ...patch.roles?.classifications },
    rules: { ...base.roles.rules, ...patch.roles?.rules },
    recordSeries: { ...base.roles.recordSeries, ...patch.roles?.recordSeries },
    ruleGroups: { ...base.roles.ruleGroups, ...patch.roles?.ruleGroups },
    gates: { ...base.roles.gates, ...patch.roles?.gates },
  }
  const manifest: PackManifest = { ...base, ...patch.manifest, roles }
  return {
    ...XX_PACK,
    ...patch.pack,
    manifest,
    classificationKeys: manifest.classifications.map((c) => c.key),
  }
}

const BUILDING_RULE_KEYS = new Set(['xx.bp.decision', 'xx.enf.order_building'])

const withoutBuilding = XX_PACK.manifest.rules.filter((r) => !BUILDING_RULE_KEYS.has(r.key))

export const XX_NO_BUILDING: StatePack = xxPackWith({
  roles: {
    classifications: { buildingPermit: null },
    rules: { buildingPermitDecision: null, buildingCodeOrder: null },
    ruleGroups: { building: [] },
  },
  manifest: {
    rules: withoutBuilding,
    classifications: XX_PACK.manifest.classifications.filter((c) => c.key !== 'xx.building_permit'),
    recordSeriesDefaults: { byClassification: {}, byApplicationType: {} },
  },
  pack: {
    ruleAreas: [{ title: 'All rules', rules: withoutBuilding }],
    buildingCodes: { choices: [], defaultChoice: null, requiredAbove: null },
    portal: { commonJobs: [], officeClassifications: [] },
  },
})

export const XX_PB_SUBDIVISION_KEY = 'xx.pb_subdivision'

export const XX_OPTIONAL_HEARING: StatePack = xxPackWith({
  manifest: {
    classifications: [
      ...XX_PACK.manifest.classifications,
      {
        key: XX_PB_SUBDIVISION_KEY,
        label: 'Subdivision',
        mandatoryRuleKeys: [],
        boardKind: 'planning_board',
        abutters: null,
        noticeRequirementKeys: [],
        requiredSubsteps: [],
        directIssueAllowed: false,
        hearing: 'optional',
        recordingRequired: false,
        appealRights: 'A decision may be appealed under Vellmora Permit Act 9.',
      },
    ],
  },
})

export const XX_HEARING_CLOCK_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'xx.pb.decision_no_hearing',
    version: 1,
    label: 'Decision deadline when no hearing is held',
    citation: { label: 'Vellmora Permit Act 5', url: 'https://laws.example/vellmora/permit-act' },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'application_accepted',
    length: { unit: 'days', value: 60 },
    direction: 'after',
    consequence: { kind: 'none_stated', text: 'The act states no consequence.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    cancelledBy: 'hearing_held',
    satisfiedByDecision: true,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'xx.pb.decision_after_hearing',
    version: 1,
    label: 'Decision deadline after a hearing',
    citation: { label: 'Vellmora Permit Act 5', url: 'https://laws.example/vellmora/permit-act' },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'hearing_held',
    length: { unit: 'days', value: 30 },
    direction: 'after',
    consequence: { kind: 'none_stated', text: 'The act states no consequence.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    satisfiedByDecision: true,
    overridePolicy: { policy: 'fixed' },
  },
]

const HEARING_CLOCK_KEYS = XX_HEARING_CLOCK_RULES.map((r) => r.key)
const HEARING_CLOCK_PACK_RULES = [...XX_PACK.manifest.rules, ...XX_HEARING_CLOCK_RULES]

export const XX_HEARING_CLOCKS: StatePack = xxPackWith({
  manifest: {
    rules: HEARING_CLOCK_PACK_RULES,
    classifications: XX_PACK.manifest.classifications.map((c) =>
      c.key === 'xx.board_variance'
        ? {
            ...c,
            hearing: 'optional' as const,
            requiredSubsteps: [],
            mandatoryRuleKeys: [...c.mandatoryRuleKeys, ...HEARING_CLOCK_KEYS],
          }
        : c,
    ),
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: HEARING_CLOCK_PACK_RULES }] },
})

export const XX_RECEIPT_LEAD_KEY = 'xx.pb.receipt_notice_lead'
export const XX_RECEIPT_MAIL_KEY = 'xx.pb.notice.receipt_mail'
export const XX_HEARING_MAIL_KEY = 'xx.pb.notice.hearing_mail'

const RECEIPT_CITATION = {
  label: 'Vellmora Permit Act 6',
  url: 'https://laws.example/vellmora/permit-act',
}

export const XX_RECEIPT_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: XX_RECEIPT_LEAD_KEY,
    version: 1,
    label: 'Notice on receipt of an application',
    citation: RECEIPT_CITATION,
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'application_received',
    length: { unit: 'days', value: 7 },
    direction: 'after',
    consequence: { kind: 'notice_defective', text: 'Notice later than this is defective.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'xx.pb.hearing_notice_lead',
    version: 1,
    label: 'Hearing notice lead',
    citation: RECEIPT_CITATION,
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'acceptance_meeting_set',
    length: { unit: 'days', value: 10 },
    direction: 'before',
    consequence: { kind: 'notice_defective', text: 'Notice later than this is defective.' },
    extension: { allowed: false, note: 'The act sets the minimum notice period.' },
    waivable: false,
    overridePolicy: { policy: 'minimum', floor: 10 },
  },
  {
    kind: 'notice_requirement',
    key: XX_RECEIPT_MAIL_KEY,
    version: 1,
    label: 'Mailed notice on receipt',
    citation: RECEIPT_CITATION,
    channel: 'verified_mail',
    recipients: { roles: ['abutter_owner', 'municipal_clerk'] },
    leadRuleKey: XX_RECEIPT_LEAD_KEY,
    stage: 'on_receipt',
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'notice_requirement',
    key: XX_HEARING_MAIL_KEY,
    version: 1,
    label: 'Mailed hearing notice',
    citation: RECEIPT_CITATION,
    channel: 'verified_mail',
    recipients: { roles: ['abutter_owner'] },
    leadRuleKey: 'xx.pb.hearing_notice_lead',
    stage: 'before_hearing',
    overridePolicy: { policy: 'fixed' },
  },
]

const RECEIPT_PACK_RULES = [...XX_PACK.manifest.rules, ...XX_RECEIPT_RULES]

export const XX_RECEIPT_NOTICES: StatePack = xxPackWith({
  manifest: {
    rules: RECEIPT_PACK_RULES,
    classifications: XX_OPTIONAL_HEARING.manifest.classifications.map((c) =>
      c.key === XX_PB_SUBDIVISION_KEY
        ? {
            ...c,
            mandatoryRuleKeys: [XX_RECEIPT_LEAD_KEY],
            noticeRequirementKeys: [XX_RECEIPT_MAIL_KEY, XX_HEARING_MAIL_KEY],
          }
        : c,
    ),
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: RECEIPT_PACK_RULES }] },
})

export const XX_VOID_KEY = 'xx.zba.void_unless_recorded'

export const XX_VOID_RULE: PackRule = {
  kind: 'clock',
  key: XX_VOID_KEY,
  version: 1,
  label: 'Record the certificate of approval',
  citation: { label: 'Vellmora Permit Act 14', url: 'https://laws.example/vellmora/permit-act' },
  clockType: 'action_due',
  whose: 'applicant',
  startEvent: 'final_written_approval',
  length: { unit: 'days', value: 90 },
  direction: 'after',
  consequence: {
    kind: 'void_unless_recorded',
    text: 'A variance not recorded within the period is void.',
  },
  extension: { allowed: false, note: 'The act provides no extension.' },
  waivable: false,
  overridePolicy: { policy: 'fixed' },
}

const RECORDING_PACK_RULES = [...XX_PACK.manifest.rules, XX_VOID_RULE]

export const XX_RECORDING: StatePack = xxPackWith({
  manifest: {
    rules: RECORDING_PACK_RULES,
    classifications: XX_PACK.manifest.classifications.map((c) =>
      c.key === 'xx.board_variance'
        ? {
            ...c,
            recordingRequired: true,
            mandatoryRuleKeys: [...c.mandatoryRuleKeys, XX_VOID_KEY],
          }
        : c,
    ),
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: RECORDING_PACK_RULES }] },
})

export const XX_SECOND_RECEIPT_LEAD_KEY = 'xx.pb.receipt_second_lead'
export const XX_SECOND_RECEIPT_MAIL_KEY = 'xx.pb.notice.receipt_second'

const SECOND_RECEIPT_RULES: PackRule[] = [
  {
    ...(XX_RECEIPT_RULES[0] as PackRule),
    key: XX_SECOND_RECEIPT_LEAD_KEY,
    length: { unit: 'days', value: 5 },
  } as PackRule,
  {
    ...(XX_RECEIPT_RULES[2] as PackRule),
    key: XX_SECOND_RECEIPT_MAIL_KEY,
    recipients: { roles: ['municipal_clerk'] },
    leadRuleKey: XX_SECOND_RECEIPT_LEAD_KEY,
  } as PackRule,
]

const TWO_LEAD_PACK_RULES = [...RECEIPT_PACK_RULES, ...SECOND_RECEIPT_RULES]

export const XX_TWO_RECEIPT_LEADS: StatePack = xxPackWith({
  manifest: {
    rules: TWO_LEAD_PACK_RULES,
    classifications: XX_RECEIPT_NOTICES.manifest.classifications.map((c) =>
      c.key === XX_PB_SUBDIVISION_KEY
        ? {
            ...c,
            mandatoryRuleKeys: [...c.mandatoryRuleKeys, XX_SECOND_RECEIPT_LEAD_KEY],
            noticeRequirementKeys: [...c.noticeRequirementKeys, XX_SECOND_RECEIPT_MAIL_KEY],
          }
        : c,
    ),
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: TWO_LEAD_PACK_RULES }] },
})
