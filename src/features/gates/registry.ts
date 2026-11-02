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
