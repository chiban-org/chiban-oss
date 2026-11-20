import type { BuildingProgramBody } from '@/features/buildingProgram/schema'
import type { StatePack } from '@/features/packs/schema'

export function buildingProgramIssues(
  body: BuildingProgramBody,
  codes: StatePack['buildingCodes'],
): string[] {
  if (body.codeChoice !== null && !codes.choices.some((c) => c.key === body.codeChoice)) {
    return ['codeChoice: not a code this state allows']
  }
  const { requiredAbove } = codes
  if (
    requiredAbove !== null &&
    body.residents !== null &&
    body.residents > requiredAbove.residents &&
    body.codeChoice !== requiredAbove.choice
  ) {
    return [
      `codeChoice: towns over ${String(requiredAbove.residents)} residents must enforce ${requiredAbove.choice}`,
    ]
  }
  return []
}
