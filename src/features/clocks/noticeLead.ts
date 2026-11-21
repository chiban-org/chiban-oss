import type { DbOrTx } from '@/db/client'
import { resolvedLength, townSettingValue } from '@/features/clocks/resolvedLength'
import { resolveRuleLength } from '@/features/clocks/ruleEngine'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { type Pack, ruleByKey } from '@/features/packs/loadPack'
import type { ClockRule } from '@/features/packs/schema'

export async function effectiveNoticeLeadDays(
  tx: DbOrTx,
  rule: ClockRule,
  facts: ProjectFacts,
  pack: Pack,
  signal: AbortSignal,
): Promise<number | undefined> {
  const length = rule.length
  if (!('earlierOfNextRegularMeeting' in length)) return undefined
  const notice = ruleByKey(pack, length.earlierOfNextRegularMeeting.noticeRuleKey)
  if (notice.kind !== 'clock') return undefined
  if ('fromSetting' in notice.length) return (await resolvedLength(tx, notice, signal)).value
  const townValue = await townSettingValue(tx, notice.key, signal)
  return resolveRuleLength(notice, facts, null, townValue).value
}
