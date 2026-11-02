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
  { key: 'nh.local_zoning_permit', label: 'Local zoning permit', mandatoryRuleKeys: [] },
  { key: 'nh.local_permit_other', label: 'Local permit or registration', mandatoryRuleKeys: [] },
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
  },
]
