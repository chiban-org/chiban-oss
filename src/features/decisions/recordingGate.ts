import { and, eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { applications, projects, relianceLinks } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { linkReliance } from '@/features/boards/exercise'
import { varianceValidity } from '@/features/decisions/recording'
import {
  buildGateDefinition,
  type GateDefinition,
  type GateEvaluator,
  registerGate,
} from '@/features/gates/registry'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import type { GateRule } from '@/features/packs/schema'
import { err, ok, type Result } from '@/types/result'

function gateRule(key: string): GateRule {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'gate') {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'Not a gate rule', { key: rule.key })
  }
  return rule
}

export function reliesOnUnrecordedReason(number: string): string {
  return `Relies on ${number}, which is not valid until its certificate is recorded.`
}

const reliedVarianceRecorded: GateEvaluator = async (tx, app, _today, signal) => {
  const links = await tx
    .select({ id: relianceLinks.varianceApplicationId, number: applications.number })
    .from(relianceLinks)
    .innerJoin(applications, eq(applications.id, relianceLinks.varianceApplicationId))
    .where(eq(relianceLinks.planningApplicationId, app.id))
    .orderBy(applications.number)
  const reasons: string[] = []
  for (const link of links) {
    const validity = await varianceValidity(tx, link.id, signal)
    if (validity === 'pending_recording' || validity === 'void') {
      reasons.push(reliesOnUnrecordedReason(link.number))
    }
  }
  return reasons.length === 0
    ? { status: 'pass' }
    : { status: 'blocked', reason: reasons.join(' ') }
}

export function varianceGateDefinitions(): GateDefinition[] {
  const key = packRoles().gates.varianceRecorded
  if (key === null) return []
  return [{ ...buildGateDefinition(gateRule(key), reliedVarianceRecorded), boundBy: null }]
}

for (const gate of varianceGateDefinitions()) registerGate(gate)

async function parcelOf(db: Db, applicationId: string): Promise<string | null> {
  const [row] = await db
    .select({ parcelId: projects.parcelId })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(and(eq(applications.id, applicationId)))
  return row?.parcelId ?? null
}

export async function linkVarianceReliance(
  db: Db,
  actor: Actor,
  input: { varianceApplicationId: string; planningApplicationId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  if (packRoles().gates.varianceRecorded === null) return err('not_found')
  if (input.varianceApplicationId === input.planningApplicationId) return err('not_found')
  const parcel = await parcelOf(db, input.planningApplicationId)
  if (parcel === null || parcel !== (await parcelOf(db, input.varianceApplicationId))) {
    return err('not_found')
  }
  if ((await varianceValidity(db, input.varianceApplicationId, signal)) === 'not_required') {
    return err('not_found')
  }
  return await linkReliance(db, actor, input, signal)
}

export async function unlinkVarianceReliance(
  db: Db,
  actor: Actor,
  input: { varianceApplicationId: string; planningApplicationId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  if (packRoles().gates.varianceRecorded === null) return err('not_found')
  return await transactionResult<void, 'forbidden' | 'not_found'>(db, async (tx) => {
    const removed = await tx
      .delete(relianceLinks)
      .where(
        and(
          eq(relianceLinks.varianceApplicationId, input.varianceApplicationId),
          eq(relianceLinks.planningApplicationId, input.planningApplicationId),
        ),
      )
      .returning({ resolvedOn: relianceLinks.resolvedOn })
    const [row] = removed
    if (row === undefined) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.reliance.unlink',
        entityType: 'application',
        entityId: input.planningApplicationId,
        before: { varianceApplicationId: input.varianceApplicationId, resolvedOn: row.resolvedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}
