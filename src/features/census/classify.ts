import { z } from 'zod'
import type { Db } from '@/db/client'
import {
  CENSUS_CATEGORIES,
  CENSUS_EXCLUDED_REASONS,
  CENSUS_PHASES,
  type CensusCategory,
  type CensusExcludedReason,
  type CensusPhase,
  censusClassifications,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

export const CENSUS_CLASSIFICATION = 'nh.building_permit'

export interface CensusInput {
  category: CensusCategory
  excludedReason: CensusExcludedReason | null
  phase: CensusPhase
  buildings: number
  housingUnits: number
  valuationDollars: number
}

export type CensusInputError =
  | 'units_do_not_fit_category'
  | 'reason_required'
  | 'phase_counts_must_be_zero'

function unitsFit(category: CensusCategory, buildings: number, units: number): boolean {
  if (buildings < 1) return false
  switch (category) {
    case 'single_family':
      return units === buildings
    case 'two_unit':
      return units === 2 * buildings
    case 'three_four_unit':
      return units >= 3 * buildings && units <= 4 * buildings
    case 'five_plus_unit':
      return units >= 5 * buildings
    case 'excluded':
      return false
  }
}

export function validateCensus(input: CensusInput): Result<void, CensusInputError> {
  if (input.category === 'excluded') {
    if (input.excludedReason === null) return err('reason_required')
    const empty = input.buildings === 0 && input.housingUnits === 0 && input.valuationDollars === 0
    return empty ? ok(undefined) : err('units_do_not_fit_category')
  }
  if (input.excludedReason !== null) return err('units_do_not_fit_category')
  if (input.phase === 'foundation_or_finish_only') {
    const zeroed = input.buildings === 0 && input.housingUnits === 0
    return zeroed && input.valuationDollars > 0 ? ok(undefined) : err('phase_counts_must_be_zero')
  }
  return unitsFit(input.category, input.buildings, input.housingUnits)
    ? ok(undefined)
    : err('units_do_not_fit_category')
}

const ClassifySchema = z.object({
  applicationId: z.string().uuid(),
  category: z.enum(CENSUS_CATEGORIES),
  excludedReason: z.enum(CENSUS_EXCLUDED_REASONS).nullable(),
  phase: z.enum(CENSUS_PHASES),
  buildings: z.number().int().min(0).max(1000),
  housingUnits: z.number().int().min(0).max(100000),
  valuationDollars: z.number().int().min(0).max(2_000_000_000),
})

export async function classifyForCensus(
  db: Db,
  actor: Actor,
  input: CensusInput & { applicationId: string },
  signal: AbortSignal,
): Promise<
  Result<void, 'forbidden' | 'invalid' | 'not_found' | 'not_a_building_permit' | CensusInputError>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'report.view', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ClassifySchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  const checked = validateCensus(value)
  if (!checked.ok) return err(checked.error)
  return await transactionResult(db, async (tx) => {
    const context = await loadApplicationContext(tx, value.applicationId, signal)
    if (context === null) return err('not_found')
    if (context.typeBody.classification !== CENSUS_CLASSIFICATION) {
      return err('not_a_building_permit')
    }
    const row = {
      category: value.category,
      excludedReason: value.excludedReason,
      phase: value.phase,
      buildings: value.buildings,
      housingUnits: value.housingUnits,
      valuationDollars: value.valuationDollars,
      classifiedBy: actor.userId,
      classifiedAt: new Date(),
    }
    await tx
      .insert(censusClassifications)
      .values({ applicationId: value.applicationId, ...row })
      .onConflictDoUpdate({ target: censusClassifications.applicationId, set: row })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'census.classified',
        entityType: 'application',
        entityId: value.applicationId,
        after: { category: value.category, phase: value.phase },
      },
      signal,
    )
    return ok(undefined)
  })
}
