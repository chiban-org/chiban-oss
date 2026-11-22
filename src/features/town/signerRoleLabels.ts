import { activePack } from '@/features/packs/registry'
import { packRoles } from '@/features/packs/roles'
import { SIGNER_ROLES, type SignerRole } from '@/features/town/profileSchema'

export function packSignerRoles(): readonly SignerRole[] {
  const plumbing = packRoles().classifications.plumbingInspectorOwns.length > 0
  return SIGNER_ROLES.filter((role) => role !== 'plumbing_inspector' || plumbing)
}

export function signerRoleLabels(): Record<SignerRole, string> {
  const boards = activePack().boardKinds
  return {
    building_official: 'Building official',
    land_use_administrator: 'Land use administrator',
    planning_board_chair: `${boards.planning_board.label} chair`,
    zba_chair: `${boards.zba.label} chair`,
    code_enforcement_officer: 'Code enforcement officer',
    town_clerk: 'Town clerk',
    plumbing_inspector: 'Plumbing inspector',
  }
}
