import type { ProceedingClassification } from '@packs/nh/schema'
import type { RecipientRole } from '@/features/abutters/roles'

const STRATEGY_KEY = 'nh.abutters.adjacency_projection'
const RESOLVER_KEY = 'nh.recipients.v1'

const ZBA_ROLES: RecipientRole[] = [
  'applicant',
  'abutter_owner',
  'condo_association_officer',
  'mhp_owner',
  'mhp_tenant',
  'restriction_holder',
]
const PB_ROLES: RecipientRole[] = [...ZBA_ROLES, 'sealed_professional']

const REGIONAL_CONDITIONAL = [
  { role: 'regional_planning_commission', when: 'regional_impact_yes' },
  { role: 'affected_municipality', when: 'regional_impact_yes' },
] as const

function planningAbutters(): NonNullable<ProceedingClassification['abutters']> {
  return {
    strategyKey: STRATEGY_KEY,
    resolverKey: RESOLVER_KEY,
    roles: PB_ROLES,
    conditionalRoles: [...REGIONAL_CONDITIONAL, { role: 'nh_des', when: 'des_within_500ft' }],
  }
}

function zbaAbutters(): NonNullable<ProceedingClassification['abutters']> {
  return {
    strategyKey: STRATEGY_KEY,
    resolverKey: RESOLVER_KEY,
    roles: ZBA_ROLES,
    conditionalRoles: [...REGIONAL_CONDITIONAL],
  }
}

const PB_NOTICE_REQUIREMENTS = [
  'nh.pb.notice_req.mail',
  'nh.pb.notice_req.des',
  'nh.pb.notice_req.public',
  'nh.ri.notice_req.certified',
]
const ZBA_NOTICE_REQUIREMENTS = [
  'nh.zba.notice_req.mail',
  'nh.zba.notice_req.newspaper',
  'nh.ri.notice_req.certified',
]
const PB_APPEAL_RIGHTS =
  'An aggrieved party may petition the superior court within 30 days after the vote (RSA 677:15).'
const ZBA_APPEAL_RIGHTS =
  'A party or person directly affected may move for rehearing within 30 days after the vote (RSA 677:2).'
const DECISION_KEYS = ['nh.board.written_decision', 'nh.board.decision_filing', 'nh.ri.transmittal']
const PB_DECISION_KEYS = [
  ...DECISION_KEYS,
  'nh.appeal.pb_court',
  'nh.appeal.pb_court_after_zba',
  'nh.appeal.amendment_window',
]
const ZBA_DECISION_KEYS = [
  ...DECISION_KEYS,
  'nh.appeal.zba_rehearing',
  'nh.appeal.zba_court',
  'nh.appeal.amendment_window',
]

const PB_NOTICE_KEYS = [
  'nh.pb.notice.mail',
  'nh.pb.des_500ft',
  'nh.ri.determination',
  'nh.ri.notice.certified',
]
const PB_PLAN_KEYS = [
  'nh.pb.filing_lead',
  'nh.pb.abutter_list_age',
  'nh.pb.completeness',
  'nh.pb.decision',
  ...PB_NOTICE_KEYS,
  ...PB_DECISION_KEYS,
  'nh.appeal.suspension',
]
const ZBA_BASE_KEYS = [
  'nh.zba.hearing',
  'nh.zba.decision',
  'nh.zba.notice.mail',
  'nh.zba.notice.newspaper',
  'nh.ri.determination',
  'nh.ri.notice.certified',
  ...ZBA_DECISION_KEYS,
]

function planning(key: ProceedingClassification['key'], label: string, keys: string[]) {
  return {
    key,
    label,
    mandatoryRuleKeys: keys,
    board: 'planning_board',
    abutters: planningAbutters(),
    noticeRequirementKeys: PB_NOTICE_REQUIREMENTS,
    requiredSubsteps: [
      { state: 'submitted', key: 'filed' },
      { state: 'under_review', key: 'hearing' },
    ],
    directIssueAllowed: false,
    appealRights: PB_APPEAL_RIGHTS,
  } satisfies ProceedingClassification
}

function zba(key: ProceedingClassification['key'], label: string, keys: string[]) {
  return {
    key,
    label,
    mandatoryRuleKeys: keys,
    board: 'zba',
    abutters: zbaAbutters(),
    noticeRequirementKeys: ZBA_NOTICE_REQUIREMENTS,
    requiredSubsteps: [{ state: 'under_review', key: 'hearing' }],
    directIssueAllowed: false,
    appealRights: ZBA_APPEAL_RIGHTS,
  } satisfies ProceedingClassification
}

export const NH_CLASSIFICATIONS: ProceedingClassification[] = [
  {
    key: 'nh.building_permit',
    label: 'Building permit',
    mandatoryRuleKeys: [
      'nh.bp.decision',
      'nh.bp.code_edition',
      'nh.bp.code_edition_recorded',
      'nh.bp.regional_impact',
      'nh.bp.regional_impact_comment',
      'nh.appeal.suspension',
      'town.bp.validity',
      'town.bp.expiration',
    ],
    board: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: true,
    appealRights: '',
  },
  {
    key: 'nh.trade_permit',
    label: 'Trade permit',
    mandatoryRuleKeys: ['nh.appeal.suspension'],
    board: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: true,
    appealRights: '',
  },
  planning('nh.pb_site_plan', 'Site plan review', PB_PLAN_KEYS),
  planning('nh.pb_subdivision', 'Subdivision or lot line adjustment', PB_PLAN_KEYS),
  planning('nh.pb_conditional_use', 'Conditional use permit', PB_PLAN_KEYS),
  planning('nh.pb_design_review', 'Design review', PB_NOTICE_KEYS),
  zba('nh.zba_variance', 'Variance', [...ZBA_BASE_KEYS, 'nh.zba.exercise']),
  zba('nh.zba_special_exception', 'Special exception', [...ZBA_BASE_KEYS, 'nh.zba.exercise']),
  zba('nh.zba_administrative_appeal', 'Appeal of administrative decision', ZBA_BASE_KEYS),
  zba(
    'nh.zba_equitable_waiver',
    'Equitable waiver of dimensional requirement',
    ZBA_BASE_KEYS.filter((k) => k !== 'nh.zba.decision'),
  ),
  {
    key: 'nh.zba_rehearing_motion',
    label: 'Motion for rehearing',
    mandatoryRuleKeys: [...DECISION_KEYS, 'nh.appeal.zba_court'],
    board: 'zba',
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: false,
    appealRights: ZBA_APPEAL_RIGHTS,
  },
  {
    key: 'nh.local_zoning_permit',
    label: 'Local zoning permit',
    mandatoryRuleKeys: [],
    board: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: true,
    appealRights: '',
  },
  {
    key: 'nh.local_permit_other',
    label: 'Local permit or registration',
    mandatoryRuleKeys: [],
    board: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: true,
    appealRights: '',
  },
  {
    key: 'nh.enforcement_zoning',
    label: 'Land use enforcement',
    mandatoryRuleKeys: [
      'nh.enf.cd_zoning',
      'nh.enf.answer_zoning',
      'nh.enf.judgment_appeal_zoning',
      'nh.enf.penalty_zoning',
      'nh.appeal.enforcement_stay',
    ],
    board: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: false,
    appealRights: '',
  },
  {
    key: 'nh.enforcement_building_code',
    label: 'Building code enforcement',
    mandatoryRuleKeys: [
      'nh.enf.cd_building',
      'nh.enf.answer_building',
      'nh.enf.judgment_appeal_building',
      'nh.enf.penalty_building',
      'nh.appeal.enforcement_stay',
    ],
    board: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: false,
    appealRights: '',
  },
]
