import { AppError, ErrorIds } from '@/constants/errorIds'
import { curePenaltyFor } from '@/features/enforcement/cureRules'
import { type PenaltyExposure, penaltyExposure } from '@/features/enforcement/penaltyExposure'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import type { CivilPenaltyRule } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'

export type PenaltySource = 'order' | 'cure' | 'pack'

export interface CasePenalty {
  rule: CivilPenaltyRule
  source: PenaltySource
}

export function enforcementPenaltyRule(): CivilPenaltyRule | null {
  const key = packRoles().rules.enforcementPenalty
  if (key === null) return null
  const rule = ruleByKey(loadPack(), key)
  if (rule.kind !== 'civil_penalty') {
    throw new AppError(ErrorIds.ENF_INVARIANT, 'Enforcement penalty role is not a civil penalty', {
      key,
    })
  }
  return rule
}

export function casePenaltyOf(
  orderPenalty: CivilPenaltyRule | null,
  cureRuleKey: string | null,
): CasePenalty | null {
  if (orderPenalty !== null) return { rule: orderPenalty, source: 'order' }
  const cure = curePenaltyFor(cureRuleKey)
  if (cure !== null) return { rule: cure, source: 'cure' }
  const pack = enforcementPenaltyRule()
  return pack === null ? null : { rule: pack, source: 'pack' }
}

export function casePenaltyExposure(
  penalty: CasePenalty | null,
  dates: {
    noticeReceivedOn: CivilDate | null
    cureReceiptOn: CivilDate | null
    convictedOn: CivilDate | null
    today: CivilDate
  },
): PenaltyExposure | null {
  if (penalty === null) return null
  const viaCure = penalty.source === 'cure'
  return penaltyExposure(penalty.rule, {
    noticeReceivedOn: viaCure ? dates.cureReceiptOn : dates.noticeReceivedOn,
    convictedOn: dates.convictedOn,
    cureReceiptOn: viaCure ? dates.cureReceiptOn : null,
    through: dates.today,
    offense: 'first',
  })
}

export function earliestConviction(
  courtJudgment: CivilDate | null,
  outcomes: { kind: string; occurredOn: string }[],
): CivilDate | null {
  const won = outcomes.filter((o) => o.kind === 'judgment_for_town').map((o) => o.occurredOn)
  return ([courtJudgment, ...won].filter((x) => x !== null).sort()[0] ?? null) as CivilDate | null
}
