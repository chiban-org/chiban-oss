import type { BoardKind, BoardKindNames } from '@/features/packs/schema'

function named(label: string, description: string): BoardKindNames {
  return { label, defaultShortName: label, shortLabel: label, abbreviation: label, description }
}

export const ME_BOARD_KINDS: Record<BoardKind, BoardKindNames> = {
  planning_board: named('Planning Board', 'Reviews subdivisions and site plans.'),
  zba: {
    label: 'Board of Appeals',
    defaultShortName: 'Board of Appeals',
    shortLabel: 'Board of Appeals',
    abbreviation: 'BOA',
    description: 'Hears variances and appeals of administrative decisions.',
  },
  historic_district_commission: named(
    'Historic Preservation Commission',
    'Reviews changes to historic buildings and districts.',
  ),
  building_code_board_of_appeals: named(
    'Building Code Appeals Board',
    'Hears appeals of building code decisions where the town has set one up.',
  ),
  conservation_commission: named(
    'Conservation Commission',
    'Advises on wetlands, open space and conservation land.',
  ),
  heritage_commission: named(
    'Heritage Commission',
    'Advises on historic buildings, landmarks and town heritage.',
  ),
  agricultural_commission: named(
    'Agricultural Commission',
    'Advises on farmland and agricultural use.',
  ),
  housing_commission: named(
    'Housing Commission',
    'Advises on housing needs and affordable housing.',
  ),
  other: {
    label: 'Other board or committee',
    defaultShortName: 'Board',
    shortLabel: 'Board',
    abbreviation: 'Board',
    description: 'Any other town body that meets and keeps minutes.',
  },
}
