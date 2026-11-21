import { AppError, ErrorIds } from '@/constants/errorIds'
import { computeDue, type DueResult } from '@/features/clocks/computeDue'
import type { HolidayCalendar } from '@/features/clocks/holidayCalendar'
import { evaluateCondition } from '@/features/forms/condition'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import type {
  ClockLength,
  ClockRule,
  FactCondition,
  OnlyWhen,
  PackRule,
  StartEvent,
} from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

export interface ResolvedLength {
  unit: 'days' | 'months' | 'business_days'
  value: number
  source: 'pack_rule' | 'town_setting'
  packDefault: number
}

type CaseCondition = Extract<ClockLength, { cases: unknown }>['cases'][number]['when']

export function onlyWhenConditions(onlyWhen: OnlyWhen | undefined): readonly FactCondition[] {
  if (onlyWhen === undefined) return []
  return Array.isArray(onlyWhen) ? onlyWhen : [onlyWhen]
}

function onlyWhenMatches(onlyWhen: OnlyWhen, facts: ProjectFacts): boolean {
  return onlyWhenConditions(onlyWhen).every((c) => factMatches(c, facts))
}

export function factMatches(when: CaseCondition, facts: ProjectFacts): boolean {
  if (when.fact === 'classification') {
    return facts.classification !== null && when.in.includes(facts.classification)
  }
  if (when.fact === 'regionalImpact') return facts.regionalImpact === when.is
  if (when.fact === 'decisionFiledLate') return facts.decisionFiledLate === when.is
  if (when.fact === 'outcome') return facts.outcome !== undefined && when.in.includes(facts.outcome)
  if (when.fact === 'significantDecision') return (facts.significantDecision ?? false) === when.is
  return evaluateCondition(
    { field: 'dwellingUnits', op: 'gt', value: when.gt },
    { dwellingUnits: facts.dwellingUnits ?? 0 },
  )
}

export function settingDefault(setting: PackRule | null): number {
  return setting?.overridePolicy.policy === 'delegated_choice' ? setting.overridePolicy.default : 0
}

export function resolveRuleLength(
  rule: ClockRule,
  facts: ProjectFacts,
  setting: PackRule | null,
  townValue: number | undefined,
): ResolvedLength {
  const length = rule.length
  if ('fromSetting' in length) {
    const fallback = settingDefault(setting)
    return {
      unit: length.unit,
      value: townValue ?? fallback,
      source: townValue === undefined ? 'pack_rule' : 'town_setting',
      packDefault: fallback,
    }
  }
  if ('cases' in length) {
    const hit = length.cases.find((c) => factMatches(c.when, facts))
    const value = hit?.value ?? length.otherwise
    return { unit: length.unit, value, source: 'pack_rule', packDefault: value }
  }
  if (length.unit === 'stated_date') {
    throw new AppError(ErrorIds.PACK_INVALID, 'A stated date rule has no fixed length', {
      key: rule.key,
    })
  }
  if (townValue !== undefined && hasLocalBound(rule)) {
    return {
      unit: length.unit,
      value: townValue,
      source: 'town_setting',
      packDefault: length.value,
    }
  }
  return { unit: length.unit, value: length.value, source: 'pack_rule', packDefault: length.value }
}

export function hasLocalBound(rule: ClockRule): boolean {
  return rule.overridePolicy.policy === 'minimum' || rule.overridePolicy.policy === 'maximum'
}

export function computeRuleDue(
  rule: ClockRule,
  length: { unit: 'days' | 'months' | 'business_days'; value: number },
  start: CivilDate,
  holidays: HolidayCalendar,
): DueResult {
  return computeDue({
    start,
    length,
    direction: rule.direction,
    clockType: rule.clockType,
    holidays,
  })
}

interface EventSelection {
  event: StartEvent
  bound: ReadonlySet<string>
  facts: ProjectFacts | undefined
  hearingDependent: boolean
}

function selectRules(rules: readonly PackRule[], s: EventSelection): ClockRule[] {
  const best = new Map<string, ClockRule>()
  for (const r of rules) {
    if (r.kind !== 'clock' || r.startEvent !== s.event || !s.bound.has(r.key)) continue
    if ((r.onlyIfHearingScheduled === true) !== s.hearingDependent) continue
    if (
      r.onlyWhen !== undefined &&
      (s.facts === undefined || !onlyWhenMatches(r.onlyWhen, s.facts))
    )
      continue
    const held = best.get(r.key)
    if (held === undefined || r.version > held.version) best.set(r.key, r)
  }
  return [...best.values()]
}

export function rulesForEvent(
  rules: readonly PackRule[],
  event: StartEvent,
  bound: ReadonlySet<string>,
  facts?: ProjectFacts,
): ClockRule[] {
  return selectRules(rules, { event, bound, facts, hearingDependent: false })
}

export function hearingDependentRulesForEvent(
  rules: readonly PackRule[],
  event: StartEvent,
  bound: ReadonlySet<string>,
  facts?: ProjectFacts,
): ClockRule[] {
  return selectRules(rules, { event, bound, facts, hearingDependent: true })
}

export function eventMovesClocks(rules: readonly PackRule[], event: StartEvent): boolean {
  return rules.some(
    (r) => r.kind === 'clock' && (r.startEvent === event || r.cancelledBy === event),
  )
}

export function keysCancelledBy(rules: readonly PackRule[], event: StartEvent): string[] {
  return rules.filter((r) => r.kind === 'clock' && r.cancelledBy === event).map((r) => r.key)
}

export function keysSatisfiedByDecision(rules: readonly PackRule[]): string[] {
  return rules.filter((r) => r.kind === 'clock' && r.satisfiedByDecision === true).map((r) => r.key)
}

export function keysSatisfiedByInspection(rules: readonly PackRule[]): string[] {
  return rules
    .filter((r) => r.kind === 'clock' && r.satisfiedByInspection === true)
    .map((r) => r.key)
}

export function keysOnlyIfHearingScheduled(rules: readonly PackRule[]): string[] {
  return rules
    .filter((r) => r.kind === 'clock' && r.onlyIfHearingScheduled === true)
    .map((r) => r.key)
}
