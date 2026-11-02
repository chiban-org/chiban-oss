import type { ProceedingClassification } from '@packs/nh/schema'
import { loadPack } from '@/features/packs/loadPack'

export function appealRightsOf(classification: Pick<ProceedingClassification, 'appealRights'>) {
  return classification.appealRights
}

export function appealRightsFor(classificationKey: string): string {
  const found = loadPack().classifications.find((c) => c.key === classificationKey)
  return found === undefined ? '' : appealRightsOf(found)
}
