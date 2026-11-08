import { PROVISION_KINDS, type ProvisionKind } from '@/db/schema/enforcementOrders'
import { TOWN_SECTION_KINDS, type TownSectionKind } from '@/db/schema/townSections'

export type SuggestionSource =
  | { kind: 'used'; count: number }
  | { kind: 'town' }
  | { kind: 'condition'; on: string }
  | { kind: 'state_code' }

export interface SectionSuggestion {
  value: string
  title: string
  sources: SuggestionSource[]
}

export type SuggestionsByKind = Record<ProvisionKind, SectionSuggestion[]>

export interface UsedRef {
  kind: ProvisionKind
  ref: string
  count: number
}

export interface TownRef {
  kind: TownSectionKind
  reference: string
  title: string
}

export interface ConditionRef {
  kind: ProvisionKind
  value: string
  on: string
}

export interface StateRef {
  reference: string
  title: string
  topic: string
}

export interface SuggestionInputs {
  used: UsedRef[]
  town: TownRef[]
  conditions: ConditionRef[]
  stateCode: StateRef[]
}

export const CHIP_COUNT = 6
export const SEARCH_LIMIT = 8

const CONDITION_KINDS: readonly ProvisionKind[] = [
  'permit_condition',
  'approved_plan',
  'board_decision',
]

export function emptyInputs(): SuggestionInputs {
  return { used: [], town: [], conditions: [], stateCode: [] }
}

export function refKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function townValue(entry: { reference: string; title: string }): string {
  const title = entry.title.trim()
  return title === '' ? entry.reference.trim() : `${entry.reference.trim()}, ${title}`
}

export function stateValue(entry: StateRef): string {
  return `${entry.reference}, ${entry.topic}`
}

interface Candidate {
  value: string
  title: string
  keys: string[]
  source: SuggestionSource
}

function usedCandidates(inputs: SuggestionInputs, kind: ProvisionKind): Candidate[] {
  return inputs.used
    .filter((u) => u.kind === kind)
    .sort((a, b) => b.count - a.count || a.ref.localeCompare(b.ref))
    .map((u) => ({
      value: u.ref.trim(),
      title: '',
      keys: [refKey(u.ref)],
      source: { kind: 'used', count: u.count },
    }))
}

function townCandidates(inputs: SuggestionInputs, kind: ProvisionKind): Candidate[] {
  return inputs.town
    .filter((t) => t.kind === kind)
    .map((t) => ({
      value: townValue(t),
      title: t.title,
      keys: [refKey(townValue(t)), refKey(t.reference)],
      source: { kind: 'town' },
    }))
}

function stateCandidates(inputs: SuggestionInputs, kind: ProvisionKind): Candidate[] {
  if (kind !== 'building_code') return []
  return inputs.stateCode.map((s) => ({
    value: stateValue(s),
    title: s.title,
    keys: [refKey(stateValue(s)), refKey(s.reference)],
    source: { kind: 'state_code' },
  }))
}

function conditionCandidates(inputs: SuggestionInputs, kind: ProvisionKind): Candidate[] {
  return inputs.conditions
    .filter((c) => c.kind === kind)
    .map((c) => ({
      value: c.value,
      title: '',
      keys: [refKey(c.value)],
      source: { kind: 'condition', on: c.on },
    }))
}

function candidatesFor(inputs: SuggestionInputs, kind: ProvisionKind): Candidate[] {
  const used = usedCandidates(inputs, kind)
  const listed = [...townCandidates(inputs, kind), ...stateCandidates(inputs, kind)]
  const conditions = conditionCandidates(inputs, kind)
  return CONDITION_KINDS.includes(kind)
    ? [...conditions, ...used, ...listed]
    : [...used, ...listed, ...conditions]
}

function prefersListedValue(source: SuggestionSource): boolean {
  return source.kind === 'town' || source.kind === 'state_code'
}

function mergeCandidates(candidates: Candidate[]): SectionSuggestion[] {
  const merged: { keys: Set<string>; suggestion: SectionSuggestion }[] = []
  for (const c of candidates) {
    const found = merged.find((m) => c.keys.some((k) => m.keys.has(k)))
    if (found === undefined) {
      merged.push({
        keys: new Set(c.keys),
        suggestion: { value: c.value, title: c.title, sources: [c.source] },
      })
      continue
    }
    for (const k of c.keys) found.keys.add(k)
    found.suggestion.sources.push(c.source)
    if (prefersListedValue(c.source)) {
      found.suggestion.value = c.value
      found.suggestion.title = c.title
    }
  }
  return merged.map((m) => m.suggestion)
}

export function mergeSuggestions(inputs: SuggestionInputs): SuggestionsByKind {
  return Object.fromEntries(
    PROVISION_KINDS.map((kind) => [kind, mergeCandidates(candidatesFor(inputs, kind))]),
  ) as SuggestionsByKind
}

export function chipsOf(list: readonly SectionSuggestion[]): SectionSuggestion[] {
  return list.slice(0, CHIP_COUNT)
}

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9.-]+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((w) => w !== '')
}

export function matchesQuery(suggestion: SectionSuggestion, query: string): boolean {
  const wanted = wordsOf(query)
  const words = wordsOf(`${suggestion.value} ${suggestion.title}`)
  return wanted.every((q) => words.some((w) => w.startsWith(q)))
}

export function searchSuggestions(
  list: readonly SectionSuggestion[],
  query: string,
  limit = SEARCH_LIMIT,
): SectionSuggestion[] {
  return list.filter((s) => matchesQuery(s, query)).slice(0, limit)
}

export function sourceLabel(source: SuggestionSource): string {
  switch (source.kind) {
    case 'used':
      return source.count === 1 ? 'Used once' : `Used ${String(source.count)} times`
    case 'town':
      return 'Town list'
    case 'condition':
      return `Condition on ${source.on}`
    case 'state_code':
      return 'State building code'
  }
}

export function sourcesLabel(suggestion: SectionSuggestion): string {
  return suggestion.sources.map(sourceLabel).join(', ')
}

export function notOnList(inputs: SuggestionInputs): UsedRef[] {
  const listed = new Set([
    ...inputs.town.flatMap((t) => [refKey(townValue(t)), refKey(t.reference)]),
    ...inputs.stateCode.flatMap((s) => [refKey(stateValue(s)), refKey(s.reference)]),
  ])
  return inputs.used
    .filter((u) => (TOWN_SECTION_KINDS as readonly string[]).includes(u.kind))
    .filter((u) => !listed.has(refKey(u.ref)))
    .sort((a, b) => b.count - a.count || a.ref.localeCompare(b.ref))
}
