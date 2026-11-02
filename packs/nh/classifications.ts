import type { ProceedingClassification } from '@packs/nh/schema'

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
  },
  {
    key: 'nh.trade_permit',
    label: 'Trade permit',
    mandatoryRuleKeys: ['nh.appeal.suspension'],
  },
]
