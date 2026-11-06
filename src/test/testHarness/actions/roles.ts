import type { Capability } from '@/constants/capabilities'
import { ROLES, type Role } from '@/constants/roles'
import { DEFAULT_GRANTS } from '@/features/authz/defaultGrants'

export type CapabilityRule = Capability | readonly Capability[]

function asList(rule: CapabilityRule): readonly Capability[] {
  return typeof rule === 'string' ? [rule] : rule
}

const GRANTS: ReadonlyMap<string, readonly Capability[]> = new Map(Object.entries(DEFAULT_GRANTS))

function holdsAny(role: Role, rule: CapabilityRule): boolean {
  const granted = GRANTS.get(role) ?? []
  return asList(rule).some((capability) => granted.includes(capability))
}

export function rolesHolding(rule: CapabilityRule): Role[] {
  return ROLES.filter((role) => holdsAny(role, rule))
}

export function rolesLacking(rule: CapabilityRule): Role[] {
  return ROLES.filter((role) => !holdsAny(role, rule))
}

export function isPublicRole(role: Role): boolean {
  return role === 'applicant' || role === 'contractor'
}
