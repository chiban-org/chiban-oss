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

export const RECIPIENT_ROLE_LABELS: Record<RecipientRole, string> = {
  applicant: 'Applicant',
  abutter_owner: 'Abutting owner',
  condo_association_officer: 'Condominium association officer',
  mhp_owner: 'Manufactured housing park owner',
  mhp_tenant: 'Manufactured housing tenant',
  restriction_holder: 'Easement or restriction holder',
  sealed_professional: 'Professional whose seal is on the plat',
  regional_planning_commission: 'Regional planning commission',
  affected_municipality: 'Affected municipality',
  nh_des: 'NH Department of Environmental Services',
}

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
