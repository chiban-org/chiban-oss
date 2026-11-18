import { z } from 'zod'

export const RECIPIENT_ROLES = [
  'applicant',
  'abutter_owner',
  'condo_association_officer',
  'mhp_owner',
  'mhp_tenant',
  'restriction_holder',
  'sealed_professional',
  'regional_planning_commission',
  'affected_municipality',
  'nh_des',
] as const

export const RecipientRoleSchema = z.enum(RECIPIENT_ROLES)
export type RecipientRole = z.infer<typeof RecipientRoleSchema>

export interface AbutterFlags {
  regionalImpact: boolean
  desWithin: boolean
}

export interface AbuttersSpec {
  strategyKey: string
  resolverKey: string
  roles: RecipientRole[]
  conditionalRoles: { role: RecipientRole; when: 'regional_impact_yes' | 'des_within_500ft' }[]
}

export function recipientRolesFor(spec: AbuttersSpec, flags: AbutterFlags): RecipientRole[] {
  const extra = spec.conditionalRoles
    .filter((c) => (c.when === 'regional_impact_yes' ? flags.regionalImpact : flags.desWithin))
    .map((c) => c.role)
  return [...new Set([...spec.roles, ...extra])]
}
