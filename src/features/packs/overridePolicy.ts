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

type DelegatedPolicy = Extract<PackRule['overridePolicy'], { policy: 'delegated_choice' }>
type ProposedValue = Exclude<ProposedTownValue, { alter: true }>

function checkDelegated(
  policy: DelegatedPolicy,
  proposed: ProposedValue,
): Result<void, TownValueError> {
  const { range } = policy
  if (range !== undefined && (proposed.value < range.min || proposed.value > range.max)) {
    return err('outside_delegated_range')
  }
  const authority = proposed.adoptingAuthority?.trim() ?? ''
  if (authority === '' || proposed.adoptedOn === undefined) return err('adoption_record_missing')
  return ok(undefined)
}

export function checkTownValue(
  rule: PackRule,
  proposed: ProposedTownValue,
): Result<void, TownValueError> {
  const policy = rule.overridePolicy
  if (policy.policy === 'fixed') return err('fixed')
  if (policy.policy === 'locally_prohibited') return err('locally_prohibited')
  if ('alter' in proposed) return ok(undefined)
  if (policy.policy === 'minimum') {
    return proposed.value < policy.floor ? err('below_minimum') : ok(undefined)
  }
  if (policy.policy === 'maximum') {
    return proposed.value > policy.ceiling ? err('above_maximum') : ok(undefined)
  }
  return checkDelegated(policy, proposed)
}
