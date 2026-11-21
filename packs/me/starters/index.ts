import { ADMIN_APPEAL_STARTER } from '@packs/me/starters/boards/adminAppeal'
import { SITE_PLAN_STARTER } from '@packs/me/starters/boards/sitePlan'
import { SUBDIVISION_STARTER } from '@packs/me/starters/boards/subdivision'
import { VARIANCE_STARTER } from '@packs/me/starters/boards/variance'
import { BUILDING_STARTER } from '@packs/me/starters/building'
import { DEMOLITION_STARTER } from '@packs/me/starters/demolition'
import { INTERNAL_PLUMBING_STARTER } from '@packs/me/starters/internalPlumbing'
import { LAND_USE_STARTER } from '@packs/me/starters/landUse'
import { SEASONAL_CONVERSION_STARTER } from '@packs/me/starters/seasonalConversion'
import { SHORELAND_STARTER } from '@packs/me/starters/shoreland'
import { SIGN_STARTER } from '@packs/me/starters/sign'
import { SUBSURFACE_WASTEWATER_STARTER } from '@packs/me/starters/subsurfaceWastewater'
import type { StarterBundle } from '@/features/packs/schema'

export const ME_STARTERS: StarterBundle[] = [
  BUILDING_STARTER,
  SHORELAND_STARTER,
  LAND_USE_STARTER,
  INTERNAL_PLUMBING_STARTER,
  SUBSURFACE_WASTEWATER_STARTER,
  SEASONAL_CONVERSION_STARTER,
  DEMOLITION_STARTER,
  SIGN_STARTER,
  VARIANCE_STARTER,
  ADMIN_APPEAL_STARTER,
  SUBDIVISION_STARTER,
  SITE_PLAN_STARTER,
]

export { ME_INSPECTION_SETTINGS_DEFAULT } from '@packs/me/starters/inspectionSettings'
