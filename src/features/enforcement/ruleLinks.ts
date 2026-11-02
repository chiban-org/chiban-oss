import type { CeaseAndDesistRule, CivilPenaltyRule, ClockRule } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'

export interface LinkedEnforcementRules {
  answer: ClockRule
  judgmentAppeal: ClockRule
  penalty: CivilPenaltyRule
}

function clockOf(key: string): ClockRule {
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'clock') {
    throw new AppError(ErrorIds.ENF_INVARIANT, 'Linked rule is not a clock', { key })
  }
  return rule
}

export function enforcementRulesFor(rule: CeaseAndDesistRule): LinkedEnforcementRules {
  const penalty = ruleByKey(loadPack(), rule.penaltyRuleKey)
  if (penalty.kind !== 'civil_penalty') {
    throw new AppError(ErrorIds.ENF_INVARIANT, 'Linked rule is not a civil penalty', {
      key: rule.penaltyRuleKey,
    })
  }
  return {
    answer: clockOf(rule.answerRuleKey),
    judgmentAppeal: clockOf(rule.judgmentAppealRuleKey),
    penalty,
  }
}
