import { primaryAbutterParams, supportsProjection } from '@/features/abutters/packParams'
import { filingLeadRule } from '@/features/boards/filingLead'
import { hasLocalBound } from '@/features/clocks/ruleEngine'
import type { NamedChoice, ReferenceChoices } from '@/features/config/referenceChoices'
import type { RuleChoiceGroups } from '@/features/config/ruleChoices'
import { TOWN_RULE_BOUNDS } from '@/features/config/townRuleBounds'
import type { FormBuilderData } from '@/features/forms/formReferences'
import type { FormField } from '@/features/forms/formSchema'
import { loadPack } from '@/features/packs/loadPack'
import { activePack } from '@/features/packs/registry'
import { packRoles } from '@/features/packs/roles'
import { policyText, ruleSummary } from '@/features/packs/ruleSummary'
import type { BoardKind, ClockRule, PackRule, StatePack } from '@/features/packs/schema'
import type { TemplateBuilderData } from '@/features/templates/builderData'
import { MERGE_FIELDS } from '@/features/templates/mergeFields'
import { lowerFirst, words } from '@/lib/words'

export interface EditorBoard {
  id: string
  kind: BoardKind
  name: string
  shortName: string
}

export interface EditorContext {
  packRules: { key: string; label: string }[]
  classifications: {
    key: string
    label: string
    mandatoryRuleKeys: string[]
    boardKind: string | null
  }[]
  mergeFields: string[]
  buildingCodes?: StatePack['buildingCodes']
  ruleGroups?: RuleChoiceGroups
  boards: EditorBoard[]
  reviewers: { id: string; name: string }[]
  townRules: Record<
    string,
    {
      label: string
      policy: string
      settable?: boolean
      unit: string | null
      min?: number
      max?: number
      citation: { label: string; url: string | null }
    }
  >
  references?: ReferenceChoices
  feeQuestions?: NamedChoice[]
  formFields?: Record<string, FormField[]>
  form?: FormBuilderData
  template?: TemplateBuilderData
  townName?: string
  townBuffer?: { defaultFt: number | null; maxFt: number }
  filingLeadPackDays?: number | null
  projectionSupported?: boolean
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

const SETTABLE_POLICIES = ['minimum', 'maximum', 'delegated_choice']

function clockUnit(rule: ClockRule): string | null {
  return 'value' in rule.length || 'fromSetting' in rule.length
    ? rule.length.unit.replaceAll('_', ' ')
    : null
}

function isBoundedClock(rule: PackRule): rule is ClockRule {
  return (
    rule.kind === 'clock' &&
    hasLocalBound(rule) &&
    'value' in rule.length &&
    rule.key !== packRoles().rules.filingLead
  )
}

export function isListedTownRule(rule: PackRule): boolean {
  return rule.kind === 'town_setting' || isBoundedClock(rule)
}

export function isSettableTownRule(rule: PackRule): boolean {
  return isListedTownRule(rule) && SETTABLE_POLICIES.includes(rule.overridePolicy.policy)
}

function townRuleRange(rule: PackRule, unit: string | null): { min: number; max: number } {
  const bounds = TOWN_RULE_BOUNDS[unit === 'months' || unit === 'days' ? unit : 'unitless']
  const policy = rule.overridePolicy
  if (policy.policy === 'minimum')
    return { min: Math.max(bounds.min, policy.floor), max: bounds.max }
  if (policy.policy === 'maximum')
    return { min: bounds.min, max: Math.min(bounds.max, policy.ceiling) }
  if (policy.policy === 'delegated_choice' && policy.range !== undefined) {
    return {
      min: Math.max(bounds.min, policy.range.min),
      max: Math.min(bounds.max, policy.range.max),
    }
  }
  return { min: bounds.min, max: bounds.max }
}

export function editorContext(
  reviewers: { id: string; name: string }[] = [],
  boards: EditorBoard[] = [],
): EditorContext {
  const pack = loadPack()
  const townBuffer = primaryAbutterParams().townBuffer
  const townRules: EditorContext['townRules'] = {}
  for (const rule of pack.rules) {
    if (!isListedTownRule(rule)) continue
    const summary = ruleSummary(rule)
    const unit = rule.kind === 'clock' ? clockUnit(rule) : summary.unit
    townRules[rule.key] = {
      label: summary.label,
      policy: policyText(rule),
      settable:
        rule.overridePolicy.policy !== 'fixed' &&
        rule.overridePolicy.policy !== 'locally_prohibited',
      unit,
      ...townRuleRange(rule, unit),
      citation: summary.citation,
    }
  }
  return {
    packRules: distinctRuleLabels(pack.rules),
    classifications: pack.classifications.map((c) => ({
      key: c.key,
      label: c.label,
      mandatoryRuleKeys: c.mandatoryRuleKeys,
      boardKind: c.boardKind ?? null,
    })),
    mergeFields: [...MERGE_FIELDS],
    buildingCodes: activePack().buildingCodes,
    ruleGroups: {
      building: packRoles().ruleGroups.building,
      board: packRoles().ruleGroups.board,
    },
    boards,
    reviewers,
    townRules,
    filingLeadPackDays: packRoles().rules.filingLead === null ? null : filingLeadRule().packDays,
    projectionSupported: supportsProjection(primaryAbutterParams()),
    ...(townBuffer === undefined ? {} : { townBuffer }),
  }
}
