import { loadPack } from '@/features/packs/loadPack'
import { policyText, ruleSummary } from '@/features/packs/ruleSummary'
import { MERGE_FIELDS } from '@/features/templates/mergeFields'

export interface EditorContext {
  packRules: { key: string; label: string }[]
  classifications: { key: string; label: string; mandatoryRuleKeys: string[] }[]
  mergeFields: string[]
  townRules: Record<
    string,
    {
      label: string
      policy: string
      unit: string | null
      citation: { label: string; url: string | null }
    }
  >
}

export function editorContext(): EditorContext {
  const pack = loadPack()
  const townRules: EditorContext['townRules'] = {}
  for (const rule of pack.rules) {
    if (rule.kind !== 'town_setting') continue
    const summary = ruleSummary(rule)
    townRules[rule.key] = {
      label: summary.label,
      policy: policyText(rule.overridePolicy),
      unit: summary.unit,
      citation: summary.citation,
    }
  }
  return {
    packRules: pack.rules.map((r) => ({ key: r.key, label: r.label })),
    classifications: pack.classifications.map((c) => ({
      key: c.key,
      label: c.label,
      mandatoryRuleKeys: c.mandatoryRuleKeys,
    })),
    mergeFields: [...MERGE_FIELDS],
    townRules,
  }
}
