import { packRoles } from '@/features/packs/roles'

export function codeEditionApplies(classification: string | undefined): boolean {
  const { classifications, rules } = packRoles()
  return (
    classification === classifications.buildingPermit &&
    rules.codeEditionGate !== null &&
    rules.codeEditionRecord !== null
  )
}
