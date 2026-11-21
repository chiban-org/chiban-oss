import { START_EVENT_LABELS } from '@/features/clocks/explainClock'
import { keysCancelledBy } from '@/features/clocks/ruleEngine'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import type { ClockRule, StartEvent } from '@/features/packs/schema'
import { clockRule, type FieldProbe, probe } from './probe'

type ConditionalCancel = Extract<NonNullable<ClockRule['cancelledBy']>, { event: unknown }>

const EVENTS = Object.keys(START_EVENT_LABELS) as StartEvent[]
const BASE: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }
const FACT_SETS: ProjectFacts[] = [
  BASE,
  { ...BASE, outcome: 'rehearing_granted' },
  { ...BASE, outcome: 'rehearing_denied' },
  { ...BASE, outcome: 'rehearing_granted', regionalImpact: true },
  { ...BASE, decisionFiledLate: true },
  { ...BASE, dwellingUnits: 3 },
  { ...BASE, significantDecision: true },
]
const CONDITIONAL: ConditionalCancel = {
  event: 'rehearing_vote',
  onlyWhen: { fact: 'outcome', in: ['rehearing_granted'] },
}

function cancelProbe(mutate: (by: ConditionalCancel) => ConditionalCancel): FieldProbe {
  return probe<ClockRule>({
    base: () => clockRule('nh.bp.decision'),
    prepare: (r) => ({ ...r, cancelledBy: CONDITIONAL }),
    mutate: (r) => ({ ...r, cancelledBy: mutate(CONDITIONAL) }),
    observe: (r) =>
      EVENTS.flatMap((e) => FACT_SETS.map((facts) => keysCancelledBy([r], e, facts).length)),
  })
}

export function cancelProbes(): Record<string, FieldProbe> {
  return {
    'clock.cancelledBy.event': cancelProbe((by) => ({ ...by, event: 'hearing_held' })),
    'clock.cancelledBy.onlyWhen': cancelProbe((by) => ({
      ...by,
      onlyWhen: [
        { fact: 'outcome', in: ['rehearing_granted'] },
        { fact: 'regionalImpact', is: true },
      ],
    })),
    'clock.cancelledBy.onlyWhen.fact': cancelProbe((by) => ({
      ...by,
      onlyWhen: { fact: 'decisionFiledLate', is: true },
    })),
    'clock.cancelledBy.onlyWhen.gt': cancelProbe((by) => ({
      ...by,
      onlyWhen: { fact: 'dwellingUnits', gt: 0 },
    })),
    'clock.cancelledBy.onlyWhen.in': cancelProbe((by) => ({
      ...by,
      onlyWhen: { fact: 'outcome', in: ['rehearing_denied'] },
    })),
    'clock.cancelledBy.onlyWhen.is': cancelProbe((by) => ({
      ...by,
      onlyWhen: { fact: 'significantDecision', is: true },
    })),
  }
}
