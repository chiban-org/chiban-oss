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
  'municipal_clerk',
  'municipal_reviewing_authority',
  'water_supplier',
] as const

export const RecipientRoleSchema = z.enum(RECIPIENT_ROLES)
export type RecipientRole = z.infer<typeof RecipientRoleSchema>

export const CONDITIONAL_ROLE_TRIGGERS = [
  'regional_impact_yes',
  'des_within_500ft',
  'source_water_area',
] as const
export type ConditionalRoleTrigger = (typeof CONDITIONAL_ROLE_TRIGGERS)[number]

export interface AbutterFlags {
  regionalImpact: boolean
  desWithin: boolean
  sourceWaterArea?: boolean | null
}

export interface AbuttersSpec {
  strategyKey: string
  resolverKey: string
  roles: RecipientRole[]
  conditionalRoles: { role: RecipientRole; when: ConditionalRoleTrigger }[]
}

const TRIGGERS: Record<ConditionalRoleTrigger, (flags: AbutterFlags) => boolean> = {
  regional_impact_yes: (flags) => flags.regionalImpact,
  des_within_500ft: (flags) => flags.desWithin,
  source_water_area: (flags) => flags.sourceWaterArea === true,
}

function triggered(when: ConditionalRoleTrigger, flags: AbutterFlags): boolean {
  return TRIGGERS[when](flags)
}

export function recipientRolesFor(spec: AbuttersSpec, flags: AbutterFlags): RecipientRole[] {
  const extra = spec.conditionalRoles.filter((c) => triggered(c.when, flags)).map((c) => c.role)
  return [...new Set([...spec.roles, ...extra])]
}
