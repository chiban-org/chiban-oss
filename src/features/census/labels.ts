import type { CensusCategory, CensusExcludedReason, CensusPhase } from '@/db/schema'

export const CENSUS_CATEGORY_LABELS: Record<CensusCategory, string> = {
  single_family: 'Single-family house (item 101)',
  two_unit: 'Two-unit building (item 103)',
  three_four_unit: 'Three- or four-unit building (item 104)',
  five_plus_unit: 'Building with five or more units (item 105)',
  excluded: 'Left out of the count',
}

export const CENSUS_PHASE_LABELS: Record<CensusPhase, string> = {
  whole_building: 'Whole building',
  foundation_or_finish_only: 'Foundation or finish work only',
}

export const CENSUS_REASON_LABELS: Record<CensusExcludedReason, string> = {
  publicly_owned: 'Publicly owned',
  nonresidential: 'Not housing',
  moved_or_relocated: 'Moved or relocated building',
  farm_building: 'Farm building',
  manufactured_hud_home: 'HUD-inspected manufactured home',
  group_quarters: 'Group quarters',
  hotel_motel: 'Hotel or motel',
  accessory_structure: 'Separately permitted accessory structure',
  demolition: 'Demolition',
  addition_or_alteration: 'Addition or alteration',
  maintenance_repair: 'Maintenance or repair',
  reissued_unchanged: 'Reissued permit with unchanged plans',
  unit_of_reported_multifamily: 'Unit of a building already reported',
}
