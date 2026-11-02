import type { ListAgeRule, ProceedingClassification, ProximityRule } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { listIsFreshAtFiling, proximityVerdict } from '@/features/abutters/proximityRule'
import { recipientRolesFor } from '@/features/abutters/roles'
import { classificationOf, type FieldProbe, packRule, probe } from '@/features/packs/probes/probe'
import { observeRule, ruleProbes } from '@/features/packs/probes/ruleProbes'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

function listAgeRule(): ListAgeRule {
  const rule = packRule('nh.pb.abutter_list_age')
  if (rule.kind !== 'list_age') throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'shape')
  return rule
}

function proximityRule(): ProximityRule {
  const rule = packRule('nh.pb.des_500ft')
  if (rule.kind !== 'proximity') throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'shape')
  return rule
}

function observeListAge(rule: ListAgeRule, original: ListAgeRule): unknown {
  return {
    generic: observeRule(rule, original),
    fresh: [0, 3, 5, 6, 8, 12].map((age) =>
      listIsFreshAtFiling(rule, d(`2027-03-${String(24 - age).padStart(2, '0')}`), d('2027-03-24')),
    ),
  }
}

function observeProximity(rule: ProximityRule, original: ProximityRule): unknown {
  return {
    generic: observeRule(rule, original),
    verdicts: [null, 120, 400, 500, 650].map((ft) => proximityVerdict(rule, ft)),
  }
}

function observeClassification(c: ProceedingClassification): unknown {
  const spec = c.abutters
  const flags = [
    { regionalImpact: false, desWithin: false },
    { regionalImpact: true, desWithin: false },
    { regionalImpact: false, desWithin: true },
    { regionalImpact: true, desWithin: true },
  ]
  return {
    board: c.board,
    strategyKey: c.abutters?.strategyKey ?? null,
    resolverKey: c.abutters?.resolverKey ?? null,
    roles: spec === null ? null : flags.map((f) => recipientRolesFor(spec, f)),
  }
}

function abuttersProbe(mutate: (c: ProceedingClassification) => ProceedingClassification) {
  return probe<ProceedingClassification>({
    base: () => classificationOf('nh.pb_site_plan'),
    mutate,
    observe: observeClassification,
  })
}

function withAbutters(
  c: ProceedingClassification,
  change: (a: NonNullable<ProceedingClassification['abutters']>) => void,
): ProceedingClassification {
  if (c.abutters !== null) change(c.abutters)
  return c
}

export function boardProbes(): Record<string, FieldProbe> {
  return {
    ...ruleProbes('list_age', 'nh.pb.abutter_list_age', ['policy']),
    'list_age.maxDaysBeforeFiling': probe<ListAgeRule>({
      base: listAgeRule,
      mutate: (r) => ({ ...r, maxDaysBeforeFiling: 9 }),
      observe: observeListAge,
    }),
    ...ruleProbes('proximity', 'nh.pb.des_500ft', ['policy']),
    'proximity.distanceFt': probe<ProximityRule>({
      base: proximityRule,
      mutate: (r) => ({ ...r, distanceFt: 300 }),
      observe: observeProximity,
    }),
    'proximity.layer': probe<ProximityRule>({
      base: proximityRule,
      mutate: (r) => ({ ...r, layer: 'roads' as never }),
      observe: observeProximity,
    }),
    'proximity.recipientRole': probe<ProximityRule>({
      base: proximityRule,
      mutate: (r) => ({ ...r, recipientRole: 'applicant' as never }),
      observe: observeProximity,
    }),
    'classification.board': abuttersProbe((c) => ({ ...c, board: 'zba' })),
    'classification.abutters.strategyKey': abuttersProbe((c) =>
      withAbutters(c, (a) => {
        a.strategyKey = 'other.strategy'
      }),
    ),
    'classification.abutters.resolverKey': abuttersProbe((c) =>
      withAbutters(c, (a) => {
        a.resolverKey = 'other.resolver'
      }),
    ),
    'classification.abutters.roles': abuttersProbe((c) =>
      withAbutters(c, (a) => {
        a.roles = a.roles.slice(1)
      }),
    ),
    'classification.abutters.conditionalRoles.role': abuttersProbe((c) =>
      withAbutters(c, (a) => {
        const first = a.conditionalRoles[0]
        if (first !== undefined) first.role = 'applicant'
      }),
    ),
    'classification.abutters.conditionalRoles.when': abuttersProbe((c) =>
      withAbutters(c, (a) => {
        const first = a.conditionalRoles[0]
        if (first !== undefined) first.when = 'des_within_500ft'
      }),
    ),
  }
}
