import { BUILDING_DEMOLITION_STARTER } from '@packs/nh/starters/buildingDemolition'
import { ELECTRICAL_STARTER } from '@packs/nh/starters/electrical'
import { MECHANICAL_GAS_STARTER } from '@packs/nh/starters/mechanicalGas'
import { PLUMBING_STARTER } from '@packs/nh/starters/plumbing'
import type { StarterBundle } from '@packs/nh/starters/types'

export type { StarterBundle } from '@packs/nh/starters/types'

export const NH_STARTERS: StarterBundle[] = [
  BUILDING_DEMOLITION_STARTER,
  ELECTRICAL_STARTER,
  PLUMBING_STARTER,
  MECHANICAL_GAS_STARTER,
]
