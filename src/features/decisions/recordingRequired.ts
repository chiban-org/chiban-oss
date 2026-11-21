import type { ProceedingClassification } from '@/features/packs/schema'

export function recordingIsRequired(classification: ProceedingClassification | undefined): boolean {
  return classification?.recordingRequired === true
}
