import { and, desc, eq, ne } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import {
  clocks,
  codeEditionRecords,
  regionalImpactDeterminations,
  regionalImpactNotices,
} from '@/db/schema'
import { applicabilityOf } from '@/features/buildingProgram/applicability'
import { clockRuleIs } from '@/features/clocks/ruleKeyIs'
import {
  buildGateDefinition,
  type GateDefinition,
  type GateEvaluator,
  registerGate,
} from '@/features/gates/registry'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles, roleCitationSuffix } from '@/features/packs/roles'
import type { GateRule } from '@/features/packs/schema'
import { formatCivilDate } from '@/lib/formatDate'

function gateRule(key: string): GateRule {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'gate') {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'Not a gate rule', { key })
  }
  return rule
}

const codeEditionRecorded: GateEvaluator = async (tx, app) => {
  const [record] = await tx
    .select({ id: codeEditionRecords.applicationId })
    .from(codeEditionRecords)
    .where(eq(codeEditionRecords.applicationId, app.id))
  return record === undefined
    ? {
        status: 'blocked',
        reason: `State building code edition not recorded${roleCitationSuffix('codeEditionGate')}.`,
      }
    : { status: 'pass' }
}

const regionalImpactCleared: GateEvaluator = async (tx, app, today) => {
  const [determination] = await tx
    .select()
    .from(regionalImpactDeterminations)
    .where(eq(regionalImpactDeterminations.applicationId, app.id))
  if (determination === undefined) {
    return {
      status: 'unknown',
      reason: `Regional impact determination not recorded${roleCitationSuffix('regionalImpactGate')}.`,
    }
  }
  if (determination.determination !== 'yes') return { status: 'pass' }
  const commission = await tx
    .select({ id: regionalImpactNotices.id })
    .from(regionalImpactNotices)
    .where(
      and(
        eq(regionalImpactNotices.applicationId, app.id),
        eq(regionalImpactNotices.recipientKind, 'regional_planning_commission'),
        eq(regionalImpactNotices.method, 'certified_mail'),
      ),
    )
    .limit(1)
  if (commission.length === 0) {
    return {
      status: 'blocked',
      reason: 'Regional planning commission not yet notified by certified mail.',
    }
  }
  const [clock] = await tx
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, app.id),
        clockRuleIs(packRoles().rules.regionalImpactComment),
        ne(clocks.status, 'superseded'),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  if (clock !== undefined && today <= clock.currentDue) {
    return {
      status: 'blocked',
      reason: `Comment period open through ${formatCivilDate(clock.currentDue)}.`,
    }
  }
  return { status: 'pass' }
}

const codeEditionRelevant: GateDefinition['relevantTo'] = (app) =>
  applicabilityOf(app, app.buildingProgram).codeChoice !== null

export function buildingGateDefinitions(): GateDefinition[] {
  const { rules } = packRoles()
  const gates: [string | null, GateEvaluator][] = [
    [rules.codeEditionGate, codeEditionRecorded],
    [rules.regionalImpactGate, regionalImpactCleared],
  ]
  return gates.flatMap(([key, evaluate]) => {
    if (key === null) return []
    const definition = buildGateDefinition(gateRule(key), evaluate)
    return [
      key === rules.codeEditionGate
        ? { ...definition, relevantTo: codeEditionRelevant }
        : definition,
    ]
  })
}

for (const gate of buildingGateDefinitions()) registerGate(gate)
