import { AppError, ErrorIds } from '@/constants/errorIds'
import { finesNeedJudgment } from '@/features/enforcement/fines'
import { penaltyExposure } from '@/features/enforcement/penaltyExposure'
import type { CivilPenaltyRule } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
import { attempt, type FieldProbe, packRule, probe } from './probe'
import { observeRule, ruleProbes } from './ruleProbes'

const d = (s: string) => s as CivilDate
const PENALTY = 'nh.enf.penalty_zoning'

function penaltyRule(): CivilPenaltyRule {
  const rule = packRule(PENALTY)
  if (rule.kind !== 'civil_penalty') throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'shape')
  return rule
}

function observePenalty(rule: CivilPenaltyRule): unknown {
  const through = d('2027-02-20')
  const run = (offense: 'first' | 'subsequent') =>
    attempt(() =>
      penaltyExposure(rule, {
        noticeReceivedOn: d('2027-02-10'),
        convictedOn: d('2027-02-05'),
        through,
        offense,
      }),
    )
  return {
    generic: observeRule(rule, rule),
    first: run('first'),
    subsequent: run('subsequent'),
    needsJudgment: finesNeedJudgment(rule),
  }
}

function penaltyProbe(mutate: (r: CivilPenaltyRule) => CivilPenaltyRule): FieldProbe {
  return probe<CivilPenaltyRule>({ base: penaltyRule, mutate, observe: observePenalty })
}

type RangePenalty = Extract<CivilPenaltyRule, { model: 'range_daily' }>

const PROBE_RANGE: RangePenalty = {
  kind: 'civil_penalty',
  key: 'probe.range_penalty',
  version: 1,
  label: 'Probe range penalty',
  citation: { label: 'Probe statute', url: 'https://laws.example/probe' },
  model: 'range_daily',
  categories: [{ key: 'one', label: 'Category one', minCentsPerDay: 1000, maxCentsPerDay: 5000 }],
  aggravations: [
    { key: 'cap', label: 'Capped', maxCentsPerDay: 3000 },
    { key: 'multiple', label: 'Multiple', maxMultipleOfBenefit: 2 },
  ],
  accrual: 'after_earlier_of_conviction_or_written_notice',
  imposedBy: 'court',
  overridePolicy: { policy: 'fixed' },
}

function rangeProbe(mutate: (r: RangePenalty) => RangePenalty): FieldProbe {
  return probe<RangePenalty>({
    base: () => PROBE_RANGE,
    mutate,
    observe: (rule) => observePenalty(rule),
  })
}

const firstCategory = (r: RangePenalty, change: Partial<RangePenalty['categories'][number]>) => ({
  ...r,
  categories: [{ ...r.categories[0], ...change } as RangePenalty['categories'][number]],
})

const aggravation = (
  r: RangePenalty,
  index: number,
  change: Partial<RangePenalty['aggravations'][number]>,
) => ({
  ...r,
  aggravations: r.aggravations.map((a, i) => (i === index ? { ...a, ...change } : a)),
})

export function penaltyProbes(): Record<string, FieldProbe> {
  return {
    ...ruleProbes('civil_penalty', PENALTY, ['policy']),
    'civil_penalty.firstOffenseCentsPerDay': penaltyProbe((r) => ({
      ...r,
      firstOffenseCentsPerDay: 1000,
    })),
    'civil_penalty.subsequentCentsPerDay': penaltyProbe((r) => ({
      ...r,
      subsequentCentsPerDay: 2000,
    })),
    'civil_penalty.model': penaltyProbe((r) => ({
      ...PROBE_RANGE,
      key: r.key,
      label: r.label,
      citation: r.citation,
    })),
    'civil_penalty.categories.key': rangeProbe((r) => firstCategory(r, { key: 'other' })),
    'civil_penalty.categories.label': rangeProbe((r) => firstCategory(r, { label: 'Other label' })),
    'civil_penalty.categories.minCentsPerDay': rangeProbe((r) =>
      firstCategory(r, { minCentsPerDay: 2000 }),
    ),
    'civil_penalty.categories.maxCentsPerDay': rangeProbe((r) =>
      firstCategory(r, { maxCentsPerDay: 9000 }),
    ),
    'civil_penalty.aggravations.key': rangeProbe((r) => aggravation(r, 0, { key: 'other' })),
    'civil_penalty.aggravations.label': rangeProbe((r) =>
      aggravation(r, 0, { label: 'Other label' }),
    ),
    'civil_penalty.aggravations.maxCentsPerDay': rangeProbe((r) =>
      aggravation(r, 0, { maxCentsPerDay: 4000 }),
    ),
    'civil_penalty.aggravations.maxMultipleOfBenefit': rangeProbe((r) =>
      aggravation(r, 1, { maxMultipleOfBenefit: 3 }),
    ),
    'civil_penalty.accrual': rangeProbe((r) => ({ ...r, accrual: null })),
    'civil_penalty.imposedBy': penaltyProbe((r) => ({ ...r, imposedBy: 'other' as never })),
  }
}
