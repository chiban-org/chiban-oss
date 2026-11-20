import { and, eq, isNull } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { gateOverrides } from '@/db/schema'
import type { ApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import { effectiveBindings } from '@/features/config/bindings'
import '@/features/gates/coreGates'
import '@/features/gates/registerAll'
import { type GateDefinition, type GateOutcome, registeredGates } from '@/features/gates/registry'
import { loadPack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

export type GateOverrideRow = typeof gateOverrides.$inferSelect

export interface GateResult {
  key: string
  label: string
  citation: { label: string; url: string | null } | null
  kind: 'administrative' | 'statutory'
  outcome: GateOutcome
  override: GateOverrideRow | null
  effective: 'pass' | 'blocked'
}

const OVERRIDE_KIND: Record<GateDefinition['kind'], GateOverrideRow['kind']> = {
  administrative: 'administrative_override',
  statutory: 'statutory_exception',
}

export async function evaluateGates(
  tx: Tx,
  app: ApplicationContext,
  to: CoreState,
  today: CivilDate,
  signal: AbortSignal,
): Promise<GateResult[]> {
  signal.throwIfAborted()
  const bindings = new Set(effectiveBindings(app.typeBody, loadPack()))
  const overrides = await tx
    .select()
    .from(gateOverrides)
    .where(and(eq(gateOverrides.applicationId, app.id), isNull(gateOverrides.revokedAt)))
  const results: GateResult[] = []
  for (const gate of registeredGates()) {
    if (!gate.appliesTo.includes(to)) continue
    if (gate.boundBy !== null && !bindings.has(gate.boundBy)) continue
    if (gate.relevantTo !== undefined && !gate.relevantTo(app)) continue
    const outcome = await gate.evaluate(tx, app, today, signal)
    const override =
      overrides.find((o) => o.gateKey === gate.key && o.kind === OVERRIDE_KIND[gate.kind]) ?? null
    const passes = outcome.status === 'pass' || override !== null
    results.push({
      key: gate.key,
      label: gate.label ?? gate.key,
      citation: gate.citation ?? null,
      kind: gate.kind,
      outcome,
      override,
      effective: passes ? 'pass' : 'blocked',
    })
  }
  return results
}
