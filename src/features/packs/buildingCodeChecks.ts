import type { StatePack } from '@/features/packs/schema'

export function buildingCodeIssues(codes: StatePack['buildingCodes']): string[] {
  const keys = new Set(codes.choices.map((c) => c.key))
  const issues: string[] = []
  if (codes.defaultChoice !== null && !keys.has(codes.defaultChoice)) {
    issues.push(`buildingCodes.defaultChoice: ${codes.defaultChoice} is not one of the choices`)
  }
  if (codes.requiredAbove !== null && !keys.has(codes.requiredAbove.choice)) {
    issues.push(
      `buildingCodes.requiredAbove.choice: ${codes.requiredAbove.choice} is not one of the choices`,
    )
  }
  return issues
}
