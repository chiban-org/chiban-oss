import type { OverridePolicy, PackRule } from '@packs/nh/schema'
import { settingDefault } from '@/features/clocks/ruleEngine'
import { ruleByKey } from '@/features/packs/loadPack'
import { checkTownValue } from '@/features/packs/overridePolicy'
import { ruleSummary } from '@/features/packs/ruleSummary'
import type { CivilDate } from '@/types/civilDate'
import { attempt, type FieldProbe, packRule, packWith, probe } from './probe'

const ADOPTION = { adoptingAuthority: 'Select Board', adoptedOn: '2027-01-05' as CivilDate }

export function observeRule(rule: PackRule, original: PackRule): unknown {
  return {
    summary: ruleSummary(rule),
    lookup: attempt(() => ruleByKey(packWith([rule]), original.key, original.version).label),
    defaultValue: settingDefault(rule),
    checks: [
      checkTownValue(rule, { value: 5 }),
      checkTownValue(rule, { value: 50 }),
      checkTownValue(rule, { value: 5, ...ADOPTION }),
      checkTownValue(rule, { value: 50, ...ADOPTION }),
      checkTownValue(rule, { alter: true }),
    ],
  }
}

const POLICIES: Record<
  string,
  { prepare: OverridePolicy; mutate: (p: OverridePolicy) => OverridePolicy }
> = {
  policy: {
    prepare: { policy: 'minimum', floor: 10 },
    mutate: () => ({ policy: 'maximum', ceiling: 10 }),
  },
  floor: {
    prepare: { policy: 'minimum', floor: 10 },
    mutate: () => ({ policy: 'minimum', floor: 3 }),
  },
  ceiling: {
    prepare: { policy: 'maximum', ceiling: 21 },
    mutate: () => ({ policy: 'maximum', ceiling: 3 }),
  },
  default: {
    prepare: { policy: 'delegated_choice', default: 12 },
    mutate: () => ({ policy: 'delegated_choice', default: 24 }),
  },
  'range.min': {
    prepare: { policy: 'delegated_choice', default: 12, range: { min: 1, max: 24 } },
    mutate: () => ({ policy: 'delegated_choice', default: 12, range: { min: 8, max: 24 } }),
  },
  'range.max': {
    prepare: { policy: 'delegated_choice', default: 12, range: { min: 1, max: 60 } },
    mutate: () => ({ policy: 'delegated_choice', default: 12, range: { min: 1, max: 20 } }),
  },
}

export function ruleProbes(
  kind: string,
  baseKey: string,
  policyFields: string[],
): Record<string, FieldProbe> {
  const out: Record<string, FieldProbe> = {}
  const generic = (field: string, mutate: (r: PackRule) => PackRule) => {
    out[`${kind}.${field}`] = probe<PackRule>({
      base: () => packRule(baseKey),
      mutate,
      observe: observeRule,
    })
  }
  generic('key', (r) => ({ ...r, key: `${r.key}.changed` }))
  generic('version', (r) => ({ ...r, version: r.version + 1 }))
  generic('label', (r) => ({ ...r, label: `${r.label} changed` }))
  generic('citation.label', (r) => ({ ...r, citation: { ...r.citation, label: 'Changed' } }))
  generic('citation.url', (r) => ({
    ...r,
    citation: { ...r.citation, url: 'https://example.test/changed' },
  }))
  for (const field of policyFields) {
    const spec = POLICIES[field]
    if (spec === undefined) continue
    out[`${kind}.overridePolicy.${field}`] = probe<PackRule>({
      base: () => packRule(baseKey),
      prepare: (r) => ({ ...r, overridePolicy: spec.prepare }) as PackRule,
      mutate: (r) => ({ ...r, overridePolicy: spec.mutate(r.overridePolicy) }) as PackRule,
      observe: observeRule,
    })
  }
  return out
}
