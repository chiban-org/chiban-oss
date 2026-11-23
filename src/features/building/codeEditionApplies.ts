import type { Applicability } from '@/features/buildingProgram/applicability'
import { isBuildingPermit, packRoles } from '@/features/packs/roles'

export function codeEditionApplies(
  classification: string | undefined,
  applicability: Applicability,
): boolean {
  const { rules } = packRoles()
  return (
    isBuildingPermit(classification) &&
    applicability.codeChoice !== null &&
    rules.codeEditionGate !== null &&
    rules.codeEditionRecord !== null
  )
}
