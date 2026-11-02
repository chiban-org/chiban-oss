import type { GateRule } from '@packs/nh/schema'
import type { Tx } from '@/db/client'
import type { ApplicationContext } from '@/features/applications/context'
import type { CoreState } from '@/features/applications/states'
import type { CivilDate } from '@/types/civilDate'

export type GateOutcome =
  | { status: 'pass' }
  | { status: 'blocked'; reason: string }
  | { status: 'unknown'; reason: string }

export interface GateDefinition {
  key: string
  label?: string
  citation?: { label: string; url: string | null }
  kind: 'administrative' | 'statutory'
  appliesTo: CoreState[]
  boundBy: string | null
  evaluate(
    tx: Tx,
    app: ApplicationContext,
    today: CivilDate,
    signal: AbortSignal,
  ): Promise<GateOutcome>
}

export type GateEvaluator = GateDefinition['evaluate']

export function buildGateDefinition(rule: GateRule, evaluate: GateEvaluator): GateDefinition {
  return {
    key: rule.key,
    label: rule.label,
    citation: rule.citation,
    kind: rule.gateKind,
    appliesTo: [...rule.appliesTo],
    boundBy: rule.key,
    evaluate,
  }
}

const registry = new Map<string, GateDefinition>()

export function registerGate(definition: GateDefinition): void {
  registry.set(definition.key, definition)
}

export function registeredGates(): GateDefinition[] {
  return [...registry.values()]
}

export function gateByKey(key: string): GateDefinition | undefined {
  return registry.get(key)
}

export function registerPackGate(rule: GateRule, evaluate: GateEvaluator): void {
  registerGate(buildGateDefinition(rule, evaluate))
}
