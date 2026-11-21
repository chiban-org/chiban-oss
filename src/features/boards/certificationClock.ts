import { loadPack } from '@/features/packs/loadPack'
import type { PackRule } from '@/features/packs/schema'

function ruleOf(ruleKey: string, ruleVersion: number): PackRule | undefined {
  const rules = loadPack().rules.filter((r) => r.key === ruleKey)
  const latest = rules.reduce<PackRule | undefined>(
    (best, r) => (best === undefined || r.version > best.version ? r : best),
    undefined,
  )
  return rules.find((r) => r.version === ruleVersion) ?? latest
}

export function offersCertification(clock: { ruleKey: string; ruleVersion: number }): boolean {
  const rule = ruleOf(clock.ruleKey, clock.ruleVersion)
  return rule?.kind === 'clock' && rule.consequence.kind === 'selectmen_certification'
}
