import { loadPack } from '@/features/packs/loadPack'
import type { ProceedingClassification } from '@/features/packs/schema'

export function appealRightsOf(classification: Pick<ProceedingClassification, 'appealRights'>) {
  return classification.appealRights
}

export function appealRightsFor(classificationKey: string): string {
  const found = loadPack().classifications.find((c) => c.key === classificationKey)
  return found === undefined ? '' : appealRightsOf(found)
}
