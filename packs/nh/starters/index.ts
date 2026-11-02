import { ALARM_REGISTRATION_STARTER } from '@packs/nh/starters/alarmRegistration'
import { BUILDING_DEMOLITION_STARTER } from '@packs/nh/starters/buildingDemolition'
import { DRIVEWAY_STARTER } from '@packs/nh/starters/driveway'
import { ELECTRICAL_STARTER } from '@packs/nh/starters/electrical'
import { HOME_OCCUPATION_STARTER } from '@packs/nh/starters/homeOccupation'
import { MECHANICAL_GAS_STARTER } from '@packs/nh/starters/mechanicalGas'
import { OCCUPANCY_REQUEST_STARTER } from '@packs/nh/starters/occupancyRequest'
import { PLUMBING_STARTER } from '@packs/nh/starters/plumbing'
import { SEPTIC_CAP_OFF_STARTER } from '@packs/nh/starters/septicCapOff'
import { SHORT_TERM_RENTAL_STARTER } from '@packs/nh/starters/shortTermRental'
import { SIGN_STARTER } from '@packs/nh/starters/sign'
import { STREET_ADDRESS_STARTER } from '@packs/nh/starters/streetAddress'
import { TEMPORARY_STRUCTURE_STARTER } from '@packs/nh/starters/temporaryStructure'
import type { StarterBundle } from '@packs/nh/starters/types'

export type { StarterBundle } from '@packs/nh/starters/types'

export const NH_STARTERS: StarterBundle[] = [
  BUILDING_DEMOLITION_STARTER,
  ELECTRICAL_STARTER,
  PLUMBING_STARTER,
  MECHANICAL_GAS_STARTER,
  DRIVEWAY_STARTER,
  SIGN_STARTER,
  HOME_OCCUPATION_STARTER,
  ALARM_REGISTRATION_STARTER,
  STREET_ADDRESS_STARTER,
  OCCUPANCY_REQUEST_STARTER,
  SEPTIC_CAP_OFF_STARTER,
  TEMPORARY_STRUCTURE_STARTER,
  SHORT_TERM_RENTAL_STARTER,
]

export { NH_INSPECTION_SETTINGS_DEFAULT } from '@packs/nh/starters/inspectionSettings'
