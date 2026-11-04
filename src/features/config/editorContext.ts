import type { FormBuilderData } from '@/features/forms/formReferences'
import { loadPack } from '@/features/packs/loadPack'
import { policyText, ruleSummary } from '@/features/packs/ruleSummary'
import { MERGE_FIELDS } from '@/features/templates/mergeFields'
import { lowerFirst, words } from '@/lib/words'

export interface EditorContext {
  packRules: { key: string; label: string }[]
  classifications: {
    key: string
    label: string
    mandatoryRuleKeys: string[]
    board: string | null
  }[]
  mergeFields: string[]
  reviewers: { id: string; name: string }[]
  townRules: Record<
    string,
    {
      label: string
      policy: string
      unit: string | null
      citation: { label: string; url: string | null }
    }
  >
  form?: FormBuilderData
}

interface PackRuleLabelSource {
  key: string
  kind: string
  label: string
  citation: { label: string }
}

function duplicated(labels: string[]): (label: string) => boolean {
  const counts = new Map<string, number>()
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1)
  return (label) => (counts.get(label) ?? 0) > 1
}

function distinctRuleLabels(rules: PackRuleLabelSource[]): EditorContext['packRules'] {
  const sharedName = duplicated(rules.map((r) => r.label))
  const cited = rules.map((r) =>
    sharedName(r.label) ? `${r.label} (${r.citation.label})` : r.label,
  )
  const sharedCitation = duplicated(cited)
  return rules.map((rule, i) => {
    const label = cited[i] ?? rule.label
    if (!sharedCitation(label)) return { key: rule.key, label }
    return {
      key: rule.key,
      label: `${rule.label} (${rule.citation.label}, ${lowerFirst(words(rule.kind))})`,
    }
  })
}

export function editorContext(reviewers: { id: string; name: string }[] = []): EditorContext {
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
    packRules: distinctRuleLabels(pack.rules),
    classifications: pack.classifications.map((c) => ({
      key: c.key,
      label: c.label,
      mandatoryRuleKeys: c.mandatoryRuleKeys,
      board: c.board ?? null,
    })),
    mergeFields: [...MERGE_FIELDS],
    reviewers,
    townRules,
  }
}
