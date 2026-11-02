import type { GateRule } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { regionalImpactDeterminations } from '@/db/schema'
import { type GateEvaluator, registerPackGate } from '@/features/gates/registry'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'

export const RI_DETERMINATION_GATE_KEY = 'nh.ri.determination'

function gateRule(): GateRule {
  const rule = ruleByKey(loadPack(), RI_DETERMINATION_GATE_KEY)
  if (rule.kind !== 'gate') {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'Not a gate rule', { key: rule.key })
  }
  return rule
}

const determinationRecorded: GateEvaluator = async (tx, app) => {
  const [row] = await tx
    .select({ id: regionalImpactDeterminations.applicationId })
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, app.id))
  return row === undefined
    ? { status: 'unknown', reason: 'Regional impact determination not recorded (RSA 36:57 I).' }
    : { status: 'pass' }
}

registerPackGate(gateRule(), determinationRecorded)
