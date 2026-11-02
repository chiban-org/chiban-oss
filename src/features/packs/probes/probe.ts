import type {
  ClockRule,
  CodeEditionEntry,
  GateRule,
  PackRule,
  ProceedingClassification,
} from '@packs/nh/schema'
import { loadPack, type Pack } from '@/features/packs/loadPack'

export interface FieldProbe {
  run(): { before: unknown; after: unknown }
}

export interface ProbeSpec<T> {
  base(): T
  prepare?(entity: T): T
  mutate(entity: T): T
  observe(entity: T, original: T): unknown
}

export function probe<T>(spec: ProbeSpec<T>): FieldProbe {
  return {
    run() {
      const original = structuredClone(spec.prepare?.(spec.base()) ?? spec.base())
      const mutated = spec.mutate(structuredClone(original))
      return { before: spec.observe(original, original), after: spec.observe(mutated, original) }
    },
  }
}

export function packRule(key: string): PackRule {
  const rule = loadPack().rules.find((r) => r.key === key)
  if (rule === undefined) throw new Error(`no pack rule ${key}`)
  return rule
}

export function clockRule(key: string): ClockRule {
  const rule = packRule(key)
  if (rule.kind !== 'clock') throw new Error(`${key} is not a clock`)
  return rule
}

export function gateRule(key: string): GateRule {
  const rule = packRule(key)
  if (rule.kind !== 'gate') throw new Error(`${key} is not a gate`)
  return rule
}

export function classificationOf(key: string): ProceedingClassification {
  const found = loadPack().classifications.find((c) => c.key === key)
  if (found === undefined) throw new Error(`no classification ${key}`)
  return found
}

export function editionOf(key: string): CodeEditionEntry {
  const found = loadPack().codeEditions.find((e) => e.key === key)
  if (found === undefined) throw new Error(`no edition ${key}`)
  return found
}

export function packWith(rules: PackRule[]): Pack {
  return { ...loadPack(), rules }
}

export function attempt<T>(fn: () => T): T | 'throws' {
  try {
    return fn()
  } catch {
    return 'throws'
  }
}
