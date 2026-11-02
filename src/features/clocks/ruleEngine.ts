import type { ClockLength, ClockRule, PackRule, StartEvent } from '@packs/nh/schema'
import { computeDue, type DueResult } from '@/features/clocks/computeDue'
import type { HolidayCalendar } from '@/features/clocks/holidayCalendar'
import { evaluateCondition } from '@/features/forms/condition'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import type { CivilDate } from '@/types/civilDate'

export interface ResolvedLength {
  unit: 'days' | 'months'
  value: number
  source: 'pack_rule' | 'town_setting'
  packDefault: number
}

type CaseCondition = Extract<ClockLength, { cases: unknown }>['cases'][number]['when']

export function factMatches(when: CaseCondition, facts: ProjectFacts): boolean {
  if (when.fact === 'classification') {
    return facts.classification !== null && when.in.includes(facts.classification)
  }
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
  return { unit: length.unit, value: length.value, source: 'pack_rule', packDefault: length.value }
}

export function computeRuleDue(
  rule: ClockRule,
  length: { unit: 'days' | 'months'; value: number },
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

export function rulesForEvent(
  rules: readonly PackRule[],
  event: StartEvent,
  bound: ReadonlySet<string>,
): ClockRule[] {
  const best = new Map<string, ClockRule>()
  for (const r of rules) {
    if (r.kind !== 'clock' || r.startEvent !== event || !bound.has(r.key)) continue
    const held = best.get(r.key)
    if (held === undefined || r.version > held.version) best.set(r.key, r)
  }
  return [...best.values()]
}
