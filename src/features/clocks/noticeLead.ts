import type { ClockRule } from '@packs/nh/schema'
import type { DbOrTx } from '@/db/client'
import { resolveRuleLength } from '@/features/clocks/ruleEngine'
import { getPublished } from '@/features/config/store'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { type Pack, ruleByKey } from '@/features/packs/loadPack'

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
  const published = await getPublished(tx, 'town_rule_setting', notice.key, signal)
  const townValue = (published?.body as { value: number } | undefined)?.value
  return resolveRuleLength(notice, facts, null, townValue).value
}
