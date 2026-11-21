import { AppError, ErrorIds } from '@/constants/errorIds'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import type { CureNoticeFact } from '@/features/enforcement/cureStanding'
import { loadPack, type Pack, ruleByKey } from '@/features/packs/loadPack'
import type { CivilPenaltyRule, ClockRule, CureNoticeRule } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

export interface CasePlanCure {
  rule: Pick<CureNoticeRule, 'label' | 'remedies'> | null
  notices: readonly CureNoticeFact[]
  holdPlaced?: boolean
  civilActionFiled?: boolean
}

export function cureRules(): CureNoticeRule[] {
  return loadPack().rules.filter((r): r is CureNoticeRule => r.kind === 'cure_notice')
}

export function cureRuleByKey(key: string | null): CureNoticeRule | null {
  if (key === null) return null
  return cureRules().find((r) => r.key === key) ?? null
}

export function cureLinks(
  pack: Pack,
  rule: CureNoticeRule,
): { cure: ClockRule; penalty: CivilPenaltyRule | null } {
  const cure = ruleByKey(pack, rule.cureRuleKey)
  if (cure.kind !== 'clock') {
    throw new AppError(ErrorIds.ENF_INVARIANT, 'Linked rule is not a clock', {
      key: rule.cureRuleKey,
    })
  }
  if (rule.penaltyRuleKey === null) return { cure, penalty: null }
  const penalty = ruleByKey(pack, rule.penaltyRuleKey)
  if (penalty.kind !== 'civil_penalty') {
    throw new AppError(ErrorIds.ENF_INVARIANT, 'Linked rule is not a civil penalty', {
      key: rule.penaltyRuleKey,
    })
  }
  return { cure, penalty }
}

export function cureClockOf(rule: CureNoticeRule): ClockRule {
  return cureLinks(loadPack(), rule).cure
}

export function cureRecipientRoles(
  rule: CureNoticeRule,
  occupantApplies: boolean,
): ('owner' | 'occupant')[] {
  const occupant: string = rule.occupant
  return occupant === 'if_applicable' && occupantApplies ? ['owner', 'occupant'] : ['owner']
}

export function cureMethodPhrase(rule: Pick<CureNoticeRule, 'method'> | null): string {
  return rule?.method === 'certified_mail_return_receipt'
    ? 'by certified mail, return receipt requested'
    : 'by mail'
}

export function casePlanCure(
  cureRuleKey: string | null,
  rows: readonly {
    findingIds: readonly string[]
    cureDue: Pick<SubjectDue, 'due'>
    returnReceiptOn: string | null
  }[],
): CasePlanCure | null {
  const rule = cureRuleByKey(cureRuleKey)
  if (rule === null) return null
  return {
    rule,
    notices: rows.map((r) => ({
      findingIds: r.findingIds,
      due: r.cureDue.due,
      returnReceiptOn: r.returnReceiptOn,
    })),
  }
}

export function packHasCureRules(): boolean {
  return cureRules().length > 0
}
