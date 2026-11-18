import type { BoardKind, BoardKindNames } from '@/features/packs/schema'

export const NH_BOARD_KINDS: Record<BoardKind, BoardKindNames> = {
  planning_board: {
    label: 'Planning Board',
    defaultShortName: 'Planning Board',
    description: 'Decides site plans, subdivisions and conditional uses under RSA 676:4.',
  },
  zba: {
    label: 'Zoning Board of Adjustment',
    defaultShortName: 'Zoning Board of Adjustment',
    description: 'Decides variances, special exceptions and appeals of administrative decisions.',
  },
  historic_district_commission: {
    label: 'Historic District Commission',
    defaultShortName: 'Historic District Commission',
    description: 'Reviews changes inside a historic district. A town may have more than one.',
  },
  building_code_board_of_appeals: {
    label: 'Building Code Board of Appeals',
    defaultShortName: 'Building Code Board of Appeals',
    description: 'Hears appeals of building code decisions, separate from the ZBA.',
  },
  conservation_commission: {
    label: 'Conservation Commission',
    defaultShortName: 'Conservation Commission',
    description: 'Advises on wetlands, open space and conservation land.',
  },
  heritage_commission: {
    label: 'Heritage Commission',
    defaultShortName: 'Heritage Commission',
    description: 'Advises on historic buildings, landmarks and town heritage.',
  },
  agricultural_commission: {
    label: 'Agricultural Commission',
    defaultShortName: 'Agricultural Commission',
    description: 'Advises on farmland and agricultural use.',
  },
  housing_commission: {
    label: 'Housing Commission',
    defaultShortName: 'Housing Commission',
    description: 'Advises on housing needs and affordable housing.',
  },
  other: {
    label: 'Other board or committee',
    defaultShortName: 'Board',
    description: 'Any other town body that meets and keeps minutes.',
  },
}

export const CLASSIFICATION_KEYS = [
  'nh.building_permit',
  'nh.trade_permit',
  'nh.pb_site_plan',
  'nh.pb_subdivision',
  'nh.pb_conditional_use',
  'nh.pb_design_review',
  'nh.zba_variance',
  'nh.zba_special_exception',
  'nh.zba_administrative_appeal',
  'nh.zba_equitable_waiver',
  'nh.zba_rehearing_motion',
  'nh.enforcement_zoning',
  'nh.enforcement_building_code',
  'nh.local_zoning_permit',
  'nh.local_permit_other',
] as const
