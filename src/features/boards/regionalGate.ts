import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { regionalImpactDeterminations } from '@/db/schema'
import {
  buildGateDefinition,
  type GateDefinition,
  type GateEvaluator,
  registerGate,
} from '@/features/gates/registry'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles, roleCitationSuffix } from '@/features/packs/roles'
import type { GateRule } from '@/features/packs/schema'

function gateRule(key: string): GateRule {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'gate') {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'Not a gate rule', { key: rule.key })
  }
  return rule
}

export function determinationMissingReason(): string {
  return `Regional impact determination not recorded${roleCitationSuffix('regionalImpactDetermination')}.`
}

const determinationRecorded: GateEvaluator = async (tx, app) => {
  const [row] = await tx
    .select({ id: regionalImpactDeterminations.applicationId })
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, app.id))
  return row === undefined
    ? {
        status: 'unknown',
        reason: determinationMissingReason(),
      }
    : { status: 'pass' }
}

export function regionalGateDefinitions(): GateDefinition[] {
  const key = packRoles().rules.regionalImpactDetermination
  return key === null ? [] : [buildGateDefinition(gateRule(key), determinationRecorded)]
}

for (const gate of regionalGateDefinitions()) registerGate(gate)
