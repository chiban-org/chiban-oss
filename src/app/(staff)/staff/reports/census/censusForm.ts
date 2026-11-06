import { z } from 'zod'
import { CENSUS_CATEGORIES, CENSUS_EXCLUDED_REASONS, CENSUS_PHASES } from '@/db/schema'
import { optionalChoice } from '@/features/input/optionalChoice'
import { choice, recordId, wholeNumber } from '@/features/input/schemas'

const MAX_BUILDINGS = 1000
const MAX_UNITS = 100_000
const MAX_VALUATION = 2_000_000_000

export const CENSUS_FORM = z.object({
  applicationId: recordId('an application'),
  category: choice('a kind of structure', CENSUS_CATEGORIES),
  excludedReason: optionalChoice(
    'why the permit is left out of the count',
    CENSUS_EXCLUDED_REASONS,
  ),
  phase: choice('a phase', CENSUS_PHASES),
  buildings: wholeNumber('the number of buildings', { min: 0, max: MAX_BUILDINGS }),
  housingUnits: wholeNumber('the number of housing units', { min: 0, max: MAX_UNITS }),
  valuationDollars: wholeNumber('the valuation in whole dollars', { min: 0, max: MAX_VALUATION }),
})
