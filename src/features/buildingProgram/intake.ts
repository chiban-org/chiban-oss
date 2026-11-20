import type { BuildingProgramBody } from '@/features/buildingProgram/schema'
import { isBuildingPermit } from '@/features/packs/roles'

export function intakeOpen(
  classification: string | undefined,
  program: BuildingProgramBody,
): boolean {
  return program.permitsEnabled || !isBuildingPermit(classification)
}
