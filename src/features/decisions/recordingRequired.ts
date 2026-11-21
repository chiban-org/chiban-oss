import type { ProceedingClassification } from '@/features/packs/schema'

export function recordingIsRequired(classification: ProceedingClassification | undefined): boolean {
  return classification?.recordingRequired === true
}

export type VarianceValidity = 'not_required' | 'pending_recording' | 'recorded' | 'void'
