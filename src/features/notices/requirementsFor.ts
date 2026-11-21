import type { RequirementFlags } from '@/features/notices/requirementPlan'
import { loadPack } from '@/features/packs/loadPack'
import type { NoticeRequirementRule, ProceedingClassification } from '@/features/packs/schema'

const FLAG_FOR: Record<NonNullable<NoticeRequirementRule['onlyWhen']>, keyof RequirementFlags> = {
  regional_impact_yes: 'regionalImpact',
  des_within_500ft: 'desWithin',
  source_water_area: 'sourceWaterArea',
}

export function applies(
  rule: NoticeRequirementRule,
  flags: RequirementFlags,
  stage: NoticeRequirementRule['stage'] = 'before_hearing',
): boolean {
  return (
    rule.stage === stage && (rule.onlyWhen === undefined || flags[FLAG_FOR[rule.onlyWhen]] === true)
  )
}

export function requirementsFor(
  classification: ProceedingClassification,
  flags: RequirementFlags,
  stage: NoticeRequirementRule['stage'] = 'before_hearing',
): NoticeRequirementRule[] {
  const rules = loadPack().rules
  return classification.noticeRequirementKeys.flatMap((key) => {
    const rule = rules.find((r) => r.key === key)
    return rule !== undefined && rule.kind === 'notice_requirement' && applies(rule, flags, stage)
      ? [rule]
      : []
  })
}
