import type { ApplicationContext } from '@/features/applications/context'
import { loadPack } from '@/features/packs/loadPack'
import type { ProceedingClassification } from '@/features/packs/schema'

export function hearingIsOptional(classification: ProceedingClassification | undefined): boolean {
  return classification?.hearing === 'optional'
}

export function classificationOfApplication(
  app: ApplicationContext,
): ProceedingClassification | undefined {
  return loadPack().classifications.find((c) => c.key === app.typeBody.classification)
}
