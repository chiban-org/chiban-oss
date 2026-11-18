import { activePack } from '@/features/packs/registry'
import type { SignerRole } from '@/features/town/profileSchema'

export function signerRoleLabels(): Record<SignerRole, string> {
  const boards = activePack().boardKinds
  return {
    building_official: 'Building official',
    land_use_administrator: 'Land use administrator',
    planning_board_chair: `${boards.planning_board.label} chair`,
    zba_chair: `${boards.zba.label} chair`,
    code_enforcement_officer: 'Code enforcement officer',
    town_clerk: 'Town clerk',
  }
}
