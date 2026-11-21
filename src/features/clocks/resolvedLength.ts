import type { DbOrTx } from '@/db/client'
import { resolveRuleLength } from '@/features/clocks/ruleEngine'
import { getPublished } from '@/features/config/store'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { ClockRule } from '@/features/packs/schema'

export interface LengthOf {
  unit: 'days' | 'months' | 'business_days'
  value: number
}

export async function townSettingValue(
  tx: DbOrTx,
  settingKey: string,
  signal: AbortSignal,
): Promise<number | undefined> {
  const published = await getPublished(tx, 'town_rule_setting', settingKey, signal)
  return (published?.body as { value: number } | undefined)?.value
}

const NO_FACTS: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }

export async function resolvedLength(
  tx: DbOrTx,
  rule: ClockRule,
  signal: AbortSignal,
): Promise<LengthOf> {
  const length = rule.length
  const settingKey = 'fromSetting' in length ? length.fromSetting : null
  const setting = settingKey === null ? null : ruleByKey(loadPack(), settingKey)
  const town = settingKey === null ? undefined : await townSettingValue(tx, settingKey, signal)
  const { unit, value } = resolveRuleLength(rule, NO_FACTS, setting, town)
  return { unit, value }
}

export function hasWindowLength(rule: ClockRule): boolean {
  return 'fromSetting' in rule.length || 'value' in rule.length
}
