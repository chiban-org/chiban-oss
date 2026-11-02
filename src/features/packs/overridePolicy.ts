import type { PackRule } from '@packs/nh/schema'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type TownValueError =
  | 'fixed'
  | 'below_minimum'
  | 'above_maximum'
  | 'outside_delegated_range'
  | 'adoption_record_missing'
  | 'locally_prohibited'

export type ProposedTownValue =
  | { value: number; adoptingAuthority?: string; adoptedOn?: CivilDate }
  | { alter: true }

export function checkTownValue(
  rule: PackRule,
  proposed: ProposedTownValue,
): Result<void, TownValueError> {
  const policy = rule.overridePolicy
  switch (policy.policy) {
    case 'fixed':
      return err('fixed')
    case 'locally_prohibited':
      return err('locally_prohibited')
    case 'minimum':
      if ('alter' in proposed) return ok(undefined)
      return proposed.value < policy.floor ? err('below_minimum') : ok(undefined)
    case 'maximum':
      if ('alter' in proposed) return ok(undefined)
      return proposed.value > policy.ceiling ? err('above_maximum') : ok(undefined)
    case 'delegated_choice': {
      if ('alter' in proposed) return ok(undefined)
      const { range } = policy
      if (range !== undefined && (proposed.value < range.min || proposed.value > range.max)) {
        return err('outside_delegated_range')
      }
      const authority = proposed.adoptingAuthority?.trim() ?? ''
      if (authority === '' || proposed.adoptedOn === undefined)
        return err('adoption_record_missing')
      return ok(undefined)
    }
  }
}
