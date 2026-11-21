import {
  SITE_PLAN_NOTICE_REQUIREMENTS,
  SITE_PLAN_RULE_KEYS,
  SUBDIVISION_RULE_KEYS,
} from '@packs/me/rules/planningBoard'
import { SUBDIVISION_NOTICE_REQUIREMENTS } from '@packs/me/rules/planningBoardNotices'
import type { ProceedingClassification } from '@/features/packs/schema'

function direct(key: string, label: string, mandatoryRuleKeys: string[]): ProceedingClassification {
  return {
    key,
    label,
    mandatoryRuleKeys,
    boardKind: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: true,
    hearing: 'required',
    recordingRequired: false,
    appealRights: '',
  }
}

type AbuttersSpec = NonNullable<ProceedingClassification['abutters']>

const SUBDIVISION_RECIPIENTS: Pick<AbuttersSpec, 'roles' | 'conditionalRoles'> = {
  roles: ['applicant', 'abutter_owner', 'municipal_clerk', 'municipal_reviewing_authority'],
  conditionalRoles: [{ role: 'water_supplier', when: 'source_water_area' }],
}

const SITE_PLAN_RECIPIENTS: Pick<AbuttersSpec, 'roles' | 'conditionalRoles'> = {
  roles: ['applicant', 'abutter_owner'],
  conditionalRoles: [],
}

function planningBoard(
  key: string,
  label: string,
  rules: {
    mandatory: string[]
    notices: string[]
    recipients: Pick<AbuttersSpec, 'roles' | 'conditionalRoles'>
  },
): ProceedingClassification {
  return {
    key,
    label,
    mandatoryRuleKeys: rules.mandatory,
    boardKind: 'planning_board',
    abutters: {
      strategyKey: 'me.adjacent_buffer.v1',
      resolverKey: 'me.recipients.v1',
      ...rules.recipients,
    },
    noticeRequirementKeys: rules.notices,
    requiredSubsteps: [],
    directIssueAllowed: false,
    hearing: 'optional',
    recordingRequired: false,
    significanceApplies: true,
    appealRights: '',
  }
}

const LOCAL_PERMIT_KEYS = ['town.permit.validity', 'town.permit.expiration']
const SHORELAND_KEYS = [
  'town.slz.decision_days',
  'town.slz.decision',
  'town.slz.validity_months',
  'town.slz.expiration',
]

export const ME_CLASSIFICATIONS: ProceedingClassification[] = [
  {
    key: 'me.building_permit',
    label: 'Building permit',
    mandatoryRuleKeys: [
      'me.bp.decision',
      'me.bp.code_edition',
      'me.bp.code_edition_recorded',
      'town.bp.validity',
      'town.bp.expiration',
    ],
    boardKind: null,
    abutters: null,
    noticeRequirementKeys: [],
    requiredSubsteps: [],
    directIssueAllowed: true,
    hearing: 'required',
    recordingRequired: false,
    appealRights: '',
  },
  direct('me.shoreland_permit', 'Shoreland permit', SHORELAND_KEYS),
  direct('me.land_use_permit', 'Land use permit', LOCAL_PERMIT_KEYS),
  direct('me.demolition_permit', 'Demolition permit', LOCAL_PERMIT_KEYS),
  direct('me.sign_permit', 'Sign permit', LOCAL_PERMIT_KEYS),
  direct('me.internal_plumbing', 'Internal plumbing permit', ['me.plumbing.validity']),
  direct('me.subsurface_wastewater', 'Subsurface wastewater permit', [
    'me.plumbing.validity',
    'me.ssw.completeness',
  ]),
  direct('me.seasonal_conversion', 'Seasonal dwelling conversion permit', ['me.plumbing.validity']),
  planningBoard('me.pb_subdivision', 'Subdivision', {
    mandatory: SUBDIVISION_RULE_KEYS,
    notices: SUBDIVISION_NOTICE_REQUIREMENTS,
    recipients: SUBDIVISION_RECIPIENTS,
  }),
  planningBoard('me.pb_site_plan', 'Site plan review', {
    mandatory: SITE_PLAN_RULE_KEYS,
    notices: SITE_PLAN_NOTICE_REQUIREMENTS,
    recipients: SITE_PLAN_RECIPIENTS,
  }),
]
