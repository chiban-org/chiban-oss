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
]
