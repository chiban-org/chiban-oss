import type { RecipientRole } from '@/features/abutters/roles'
import { activePack } from '@/features/packs/registry'

const ENGINE_LABELS: Readonly<Record<Exclude<RecipientRole, 'nh_des'>, string>> = {
  applicant: 'Applicant',
  abutter_owner: 'Abutting owner',
  condo_association_officer: 'Condominium association officer',
  mhp_owner: 'Manufactured housing park owner',
  mhp_tenant: 'Manufactured housing tenant',
  restriction_holder: 'Easement or restriction holder',
  sealed_professional: 'Professional whose seal is on the plat',
  regional_planning_commission: 'Regional planning commission',
  affected_municipality: 'Affected municipality',
}

export function recipientRoleLabel(role: RecipientRole): string {
  return role === 'nh_des' ? activePack().labels.environmentalAgency : ENGINE_LABELS[role]
}
