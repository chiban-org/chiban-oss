import type { ClockRule, PackRule, StartEvent } from '@packs/nh/schema'
import type { clocks } from '@/db/schema'
import { checkAdjustment } from '@/features/clocks/adjustClock'
import { explainClock, START_EVENT_LABELS } from '@/features/clocks/explainClock'
import { computeRuleDue, resolveRuleLength, rulesForEvent } from '@/features/clocks/ruleEngine'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { packHolidayCalendar } from '@/features/packs/holidays'
import type { CivilDate } from '@/types/civilDate'
import { attempt, clockRule, type FieldProbe, packRule, probe } from './probe'
import { observeRule, ruleProbes } from './ruleProbes'

export const ALL_POLICY_FIELDS = ['policy', 'floor', 'ceiling', 'default', 'range.min', 'range.max']
const d = (s: string) => s as CivilDate
const FACT_SETS: ProjectFacts[] = [
  { classification: 'nonresidential', dwellingUnits: null, afterTheFact: false },
  { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
  { classification: 'residential', dwellingUnits: 5, afterTheFact: false },
  { classification: 'residential', dwellingUnits: 11, afterTheFact: false },
]
const START_DATES = ['2026-10-04', '2027-03-04', '2027-06-04', '2027-11-25'].map(d)
const EVENTS = Object.keys(START_EVENT_LABELS) as StartEvent[]

function syntheticClock(rule: ClockRule): typeof clocks.$inferSelect {
  return {
    id: 'c1',
    applicationId: 'a1',
    ruleKey: rule.key,
    ruleVersion: rule.version,
    packVersion: '0',
    startEvent: 'application_completed',
    startDate: '2027-03-01',
    lengthValue: 30,
    lengthUnit: 'days',
    countingMethod: 'm',
    computedDue: '2027-03-31',
    currentDue: '2027-03-31',
    rolledFrom: null,
    status: 'running',
    metOn: null,
    source: 'pack_rule',
    replacedDue: null,
    supersededBy: null,
    supersededReason: null,
    createdAt: new Date(0),
  }
}

function observeClock(rule: ClockRule, original: ClockRule): unknown {
  const settingKey = 'fromSetting' in rule.length ? rule.length.fromSetting : null
  const found = settingKey === null ? null : attempt(() => packRule(settingKey))
  const settingRule: PackRule | null = found === 'throws' ? null : found
  const lengths = FACT_SETS.map((f) =>
    attempt(() => resolveRuleLength(rule, f, settingRule, undefined)),
  )
  const dues = lengths.map((l) =>
    l === 'throws'
      ? l
      : START_DATES.map((s) =>
          computeRuleDue(rule, { unit: l.unit, value: l.value }, s, packHolidayCalendar()),
        ),
  )
  return {
    generic: observeRule(rule, original),
    explanation: explainClock(syntheticClock(rule), [], rule, d('2027-03-20')),
    lengths,
    dues,
    townLength: attempt(() =>
      resolveRuleLength(rule, FACT_SETS[1] as ProjectFacts, settingRule, 18),
    ),
    started: EVENTS.map((e) => rulesForEvent([rule], e, new Set([original.key])).length),
    adjustments: [
      checkAdjustment(rule, { kind: 'extension' }),
      checkAdjustment(rule, { kind: 'extension', applicantConsent: true }),
      checkAdjustment(rule, { kind: 'waiver' }),
    ],
  }
}

type Mutator = (r: ClockRule) => ClockRule

function clockProbe(baseKey: string, mutate: Mutator): FieldProbe {
  return probe<ClockRule>({ base: () => clockRule(baseKey), mutate, observe: observeClock })
}

function mapCases(
  r: ClockRule,
  fn: (c: { when: unknown; value: number }, i: number) => unknown,
): ClockRule {
  if (!('cases' in r.length)) return r
  const cases = r.length.cases.map((c, i) => fn(c, i)) as typeof r.length.cases
  return { ...r, length: { ...r.length, cases } }
}

export function clockProbes(): Record<string, FieldProbe> {
  const probes: Record<string, FieldProbe> = {
    ...ruleProbes('clock', 'nh.bp.decision', ALL_POLICY_FIELDS),
    'clock.clockType': clockProbe('nh.bp.regional_impact_comment', (r) => ({
      ...r,
      clockType: 'action_due',
    })),
    'clock.whose': clockProbe('nh.bp.decision', (r) => ({ ...r, whose: 'board' })),
    'clock.startEvent': clockProbe('nh.bp.decision', (r) => ({
      ...r,
      startEvent: 'permit_issued',
    })),
    'clock.direction': clockProbe('nh.bp.decision', (r) => ({ ...r, direction: 'before' })),
    'clock.length.unit': clockProbe('nh.bp.regional_impact_comment', (r) => ({
      ...r,
      length: { unit: 'months', value: 30 },
    })),
    'clock.length.value': clockProbe('nh.bp.regional_impact_comment', (r) => ({
      ...r,
      length: { unit: 'days', value: 45 },
    })),
    'clock.length.otherwise': clockProbe('nh.bp.decision', (r) =>
      'cases' in r.length ? { ...r, length: { ...r.length, otherwise: 14 } } : r,
    ),
    'clock.length.fromSetting': clockProbe('town.bp.expiration', (r) => ({
      ...r,
      length: { unit: 'months', fromSetting: 'nh.code.technical_requirements' },
    })),
    'clock.length.cases.value': clockProbe('nh.bp.decision', (r) =>
      mapCases(r, (c, i) => (i === 0 ? { ...c, value: 90 } : c)),
    ),
    'clock.length.cases.when.fact': clockProbe('nh.bp.decision', (r) =>
      mapCases(r, (c, i) =>
        i === 1 ? { ...c, when: { fact: 'classification', in: ['residential'] } } : c,
      ),
    ),
    'clock.length.cases.when.in': clockProbe('nh.bp.decision', (r) =>
      mapCases(r, (c, i) =>
        i === 0 ? { ...c, when: { fact: 'classification', in: ['residential'] } } : c,
      ),
    ),
    'clock.length.cases.when.gt': clockProbe('nh.bp.decision', (r) =>
      mapCases(r, (c, i) => (i === 1 ? { ...c, when: { fact: 'dwellingUnits', gt: 0 } } : c)),
    ),
    'clock.consequence.kind': clockProbe('nh.bp.decision', (r) => ({
      ...r,
      consequence: { ...r.consequence, kind: 'lapse' },
    })),
    'clock.consequence.text': clockProbe('nh.bp.decision', (r) => ({
      ...r,
      consequence: { ...r.consequence, text: 'Changed' },
    })),
    'clock.extension.allowed': clockProbe('nh.bp.decision', (r) => ({
      ...r,
      extension: { allowed: true, by: 'town_renewal' },
    })),
    'clock.extension.note': clockProbe('nh.bp.decision', (r) =>
      r.extension.allowed ? r : { ...r, extension: { allowed: false, note: 'Changed note' } },
    ),
    'clock.extension.by': clockProbe('town.bp.expiration', (r) => ({
      ...r,
      extension: { allowed: true, by: 'applicant_consent' },
    })),
    'clock.waivable': clockProbe('nh.bp.decision', (r) => ({ ...r, waivable: true })),
  }
  return probes
}
