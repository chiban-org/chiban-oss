import type { RecipientRole } from '@/features/abutters/roles'
import { activePack } from '@/features/packs/registry'
import { boardLabel, governingBody } from '@/features/packs/vocabulary'

const ENGINE_LABELS: Readonly<
  Record<Exclude<RecipientRole, 'nh_des' | 'planning_board' | 'municipal_officers'>, string>
> = {
  applicant: 'Applicant',
  abutter_owner: 'Abutting owner',
  condo_association_officer: 'Condominium association officer',
  mhp_owner: 'Manufactured housing park owner',
  mhp_tenant: 'Manufactured housing tenant',
  restriction_holder: 'Easement or restriction holder',
  sealed_professional: 'Professional whose seal is on the plat',
  regional_planning_commission: 'Regional planning commission',
  affected_municipality: 'Affected municipality',
  municipal_clerk: 'Municipal clerk',
  municipal_reviewing_authority: 'Municipal reviewing authority',
  water_supplier: 'Public water supplier',
}

export function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function recipientRoleLabel(role: RecipientRole): string {
  if (role === 'nh_des') return activePack().labels.environmentalAgency
  if (role === 'planning_board') return boardLabel('planning_board')
  if (role === 'municipal_officers') return capitalised(governingBody())
  return ENGINE_LABELS[role]
}
