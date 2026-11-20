import { AppError, ErrorIds } from '@/constants/errorIds'
import { activePack } from '@/features/packs/registry'
import type { PackRoles, RuleRole } from '@/features/packs/schema'

export function packRoles(): PackRoles {
  return activePack().manifest.roles
}

export function requireRuleRole(role: RuleRole): string {
  const key = packRoles().rules[role]
  if (key === null) {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'The jurisdiction pack has no rule for this', {
      role,
    })
  }
  return key
}

export function presentKeys(keys: readonly (string | null)[]): string[] {
  return keys.filter((key): key is string => key !== null)
}

export function isBuildingPermit(classification: string | undefined): boolean {
  const { buildingPermit } = packRoles().classifications
  return buildingPermit !== null && classification === buildingPermit
}

export function keyedByRole<V>(entries: readonly (readonly [string | null, V])[]): Map<string, V> {
  return new Map(entries.flatMap(([key, value]) => (key === null ? [] : [[key, value] as const])))
}

export function inRuleGroup(ruleKey: string, group: readonly string[]): boolean {
  return group.some((entry) =>
    entry.endsWith('.') ? ruleKey.startsWith(entry) : ruleKey === entry,
  )
}
