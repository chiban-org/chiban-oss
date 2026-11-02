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
  'nh.appeal.suspension',
]
const ZBA_BASE_KEYS = [
  'nh.zba.hearing',
  'nh.zba.decision',
  'nh.zba.notice.mail',
  'nh.zba.notice.newspaper',
  'nh.ri.determination',
  'nh.ri.notice.certified',
]

function planning(key: ProceedingClassification['key'], label: string, keys: string[]) {
  return {
    key,
    label,
    mandatoryRuleKeys: keys,
    board: 'planning_board',
    abutters: planningAbutters(),
  } satisfies ProceedingClassification
}

function zba(key: ProceedingClassification['key'], label: string, keys: string[]) {
  return {
    key,
    label,
    mandatoryRuleKeys: keys,
    board: 'zba',
    abutters: zbaAbutters(),
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
  },
  {
    key: 'nh.trade_permit',
    label: 'Trade permit',
    mandatoryRuleKeys: ['nh.appeal.suspension'],
    board: null,
    abutters: null,
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
    mandatoryRuleKeys: [],
    board: 'zba',
    abutters: null,
  },
]
