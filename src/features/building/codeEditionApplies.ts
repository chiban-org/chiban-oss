import { isBuildingPermit, packRoles } from '@/features/packs/roles'

export function codeEditionApplies(classification: string | undefined): boolean {
  const { rules } = packRoles()
  return (
    isBuildingPermit(classification) &&
    rules.codeEditionGate !== null &&
    rules.codeEditionRecord !== null
  )
}
