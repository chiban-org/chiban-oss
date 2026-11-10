import { ALARM_REGISTRATION_STARTER } from '@packs/nh/starters/alarmRegistration'
import { PLANNING_BOARD_STARTERS } from '@packs/nh/starters/boards/planningBoard'
import { ZBA_STARTERS } from '@packs/nh/starters/boards/zba'
import { BUILDING_DEMOLITION_STARTER } from '@packs/nh/starters/buildingDemolition'
import { DRIVEWAY_STARTER } from '@packs/nh/starters/driveway'
import { ELECTRICAL_STARTER } from '@packs/nh/starters/electrical'
import { ENERGY_CODE_STARTER } from '@packs/nh/starters/energyCode'
import { HOME_OCCUPATION_STARTER } from '@packs/nh/starters/homeOccupation'
import { INVOLUNTARY_MERGER_STARTER } from '@packs/nh/starters/involuntaryMerger'
import { MECHANICAL_GAS_STARTER } from '@packs/nh/starters/mechanicalGas'
import { OCCUPANCY_REQUEST_STARTER } from '@packs/nh/starters/occupancyRequest'
import { PLUMBING_STARTER } from '@packs/nh/starters/plumbing'
import { SEPTIC_CAP_OFF_STARTER } from '@packs/nh/starters/septicCapOff'
import { SHORT_TERM_RENTAL_STARTER } from '@packs/nh/starters/shortTermRental'
import { SIGN_STARTER } from '@packs/nh/starters/sign'
import { STREET_ADDRESS_STARTER } from '@packs/nh/starters/streetAddress'
import { TEMPORARY_STRUCTURE_STARTER } from '@packs/nh/starters/temporaryStructure'
import { TEMPORARY_USE_STARTER } from '@packs/nh/starters/temporaryUse'
import type { StarterBundle } from '@packs/nh/starters/types'
import { VOLUNTARY_MERGER_STARTER } from '@packs/nh/starters/voluntaryMerger'

export type { StarterBundle } from '@packs/nh/starters/types'

export const NH_STARTERS: StarterBundle[] = [
  BUILDING_DEMOLITION_STARTER,
  ELECTRICAL_STARTER,
  PLUMBING_STARTER,
  MECHANICAL_GAS_STARTER,
  ...PLANNING_BOARD_STARTERS,
  ...ZBA_STARTERS,
  DRIVEWAY_STARTER,
  SIGN_STARTER,
  HOME_OCCUPATION_STARTER,
  ALARM_REGISTRATION_STARTER,
  STREET_ADDRESS_STARTER,
  OCCUPANCY_REQUEST_STARTER,
  SEPTIC_CAP_OFF_STARTER,
  TEMPORARY_STRUCTURE_STARTER,
  SHORT_TERM_RENTAL_STARTER,
  VOLUNTARY_MERGER_STARTER,
  INVOLUNTARY_MERGER_STARTER,
  ENERGY_CODE_STARTER,
  TEMPORARY_USE_STARTER,
]

export { NH_INSPECTION_SETTINGS_DEFAULT } from '@packs/nh/starters/inspectionSettings'
