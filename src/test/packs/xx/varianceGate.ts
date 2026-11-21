import type { PackRule, StatePack } from '@/features/packs/schema'
import { XX_RECORDING, xxPackWith } from './variants'

export const XX_VARIANCE_GATE_KEY = 'xx.gate.variance_recorded'

export const XX_VARIANCE_GATE_RULE: PackRule = {
  kind: 'gate',
  key: XX_VARIANCE_GATE_KEY,
  version: 1,
  label: 'Variance relied on is recorded',
  citation: { label: 'Vellmora Permit Act 14', url: 'https://laws.example/vellmora/permit-act' },
  gateKind: 'statutory',
  appliesTo: ['issued', 'decided'],
  overridePolicy: { policy: 'fixed' },
}

const GATE_PACK_RULES = [...XX_RECORDING.manifest.rules, XX_VARIANCE_GATE_RULE]

export const XX_VARIANCE_GATE: StatePack = xxPackWith({
  roles: { gates: { varianceRecorded: XX_VARIANCE_GATE_KEY } },
  manifest: {
    rules: GATE_PACK_RULES,
    classifications: XX_RECORDING.manifest.classifications,
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: GATE_PACK_RULES }] },
})
