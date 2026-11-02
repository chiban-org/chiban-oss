import type { NoticeRequirementRule, ProceedingClassification } from '@packs/nh/schema'
import type { RequirementFlags } from '@/features/notices/requirementPlan'
import { loadPack } from '@/features/packs/loadPack'

const FLAG_FOR: Record<NonNullable<NoticeRequirementRule['onlyWhen']>, keyof RequirementFlags> = {
  regional_impact_yes: 'regionalImpact',
  des_within_500ft: 'desWithin',
}

export function applies(rule: NoticeRequirementRule, flags: RequirementFlags): boolean {
  return rule.onlyWhen === undefined || flags[FLAG_FOR[rule.onlyWhen]]
}

export function requirementsFor(
  classification: ProceedingClassification,
  flags: RequirementFlags,
): NoticeRequirementRule[] {
  const rules = loadPack().rules
  return classification.noticeRequirementKeys.flatMap((key) => {
    const rule = rules.find((r) => r.key === key)
    return rule !== undefined && rule.kind === 'notice_requirement' && applies(rule, flags)
      ? [rule]
      : []
  })
}
