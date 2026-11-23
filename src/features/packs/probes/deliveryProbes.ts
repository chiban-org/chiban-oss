import {
  deliveryRuleFor,
  methodAllowed,
  type PartyRecipient,
  plannedRecipients,
} from '@/features/decisions/delivery'
import { ALL_POLICY_FIELDS } from '@/features/packs/probes/clockProbes'
import { type FieldProbe, packWith, probe } from '@/features/packs/probes/probe'
import { ruleProbes } from '@/features/packs/probes/ruleProbes'
import { BOARD_KINDS, DELIVERY_METHODS, type DecisionDeliveryRule } from '@/features/packs/schema'

const PROBE_RULE: DecisionDeliveryRule = {
  kind: 'decision_delivery',
  key: 'probe.delivery',
  version: 1,
  label: 'Probe delivery',
  citation: { label: 'Probe statute', url: 'https://laws.example/probe' },
  boardKinds: ['zba'],
  recipients: ['applicant', 'agent', 'planning_board', 'municipal_officers'],
  methods: ['mail', 'hand'],
  dueRuleKey: 'probe.delivery_due',
  overridePolicy: { policy: 'fixed' },
}

const PARTIES: PartyRecipient[] = [
  { id: 'p1', name: 'Applicant One', role: 'applicant' },
  { id: 'p2', name: 'Agent One', role: 'agent' },
]
const NAMES = { planningBoard: 'Planning Board', municipalOfficers: 'Selectmen' }

function observeDelivery(rule: DecisionDeliveryRule) {
  const pack = packWith([rule])
  return {
    byBoard: BOARD_KINDS.map((kind) => {
      const found = deliveryRuleFor(pack, kind)
      return found === null
        ? null
        : { due: found.dueRuleKey, planned: plannedRecipients(found, PARTIES, NAMES) }
    }),
    methods: DELIVERY_METHODS.map((m) => methodAllowed(rule, m)),
  }
}

function deliveryProbe(mutate: (r: DecisionDeliveryRule) => DecisionDeliveryRule): FieldProbe {
  return probe<DecisionDeliveryRule>({
    base: () => PROBE_RULE,
    mutate,
    observe: observeDelivery,
  })
}

export function deliveryProbes(): Record<string, FieldProbe> {
  return {
    ...ruleProbes('decision_delivery', PROBE_RULE.key, ['policy'], () => PROBE_RULE),
    'decision_delivery.boardKinds': deliveryProbe((r) => ({
      ...r,
      boardKinds: ['planning_board'],
    })),
    'decision_delivery.recipients': deliveryProbe((r) => ({ ...r, recipients: ['applicant'] })),
    'decision_delivery.methods': deliveryProbe((r) => ({ ...r, methods: ['mail'] })),
    'decision_delivery.dueRuleKey': deliveryProbe((r) => ({
      ...r,
      dueRuleKey: 'probe.other_due',
    })),
  }
}
