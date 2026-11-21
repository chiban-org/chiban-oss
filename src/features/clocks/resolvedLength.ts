import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import { settingDefault } from '@/features/clocks/ruleEngine'
import { getPublished } from '@/features/config/store'
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

export async function resolvedLength(
  tx: DbOrTx,
  rule: ClockRule,
  signal: AbortSignal,
): Promise<LengthOf> {
  const length = rule.length
  if ('fromSetting' in length) {
    const setting = ruleByKey(loadPack(), length.fromSetting)
    const town = await townSettingValue(tx, length.fromSetting, signal)
    return { unit: length.unit, value: town ?? settingDefault(setting) }
  }
  if ('value' in length) {
    return { unit: length.unit, value: length.value }
  }
  throw new AppError(ErrorIds.PACK_INVALID, 'The rule has no length to resolve', { key: rule.key })
}

export function hasWindowLength(rule: ClockRule): boolean {
  return 'fromSetting' in rule.length || 'value' in rule.length
}
