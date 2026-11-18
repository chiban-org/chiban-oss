import { activePack } from '@/features/packs/registry'
import { OTHER_LAW_EXEMPTION_KEY, type RtkExemption } from '@/features/packs/schema'

export const OTHER_LAW_EXEMPTION_LABEL = 'Made confidential by another law'

export function packExemptions(): readonly RtkExemption[] {
  return activePack().rtkExemptions
}

export function exemptionKeys(): string[] {
  return [...packExemptions().map((e) => e.key), OTHER_LAW_EXEMPTION_KEY]
}

export function exemptionChoices(): { key: string; label: string }[] {
  return [
    ...packExemptions().map((e) => ({ key: e.key, label: `${e.citation.label}: ${e.label}` })),
    { key: OTHER_LAW_EXEMPTION_KEY, label: OTHER_LAW_EXEMPTION_LABEL },
  ]
}
